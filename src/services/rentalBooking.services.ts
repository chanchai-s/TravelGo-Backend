import prisma from "../lib/prismaClient";
import {
  findVehicleConflict,
  getRentalSettings,
  lateFeeFor,
  makeRentalRef,
  quoteRental,
  rentalDays,
} from "../lib/rentalPricing";

/**
 * การจองรถเช่า (RentalDetail เกาะกับ Booking)
 * ลูกค้าจองได้ทันที แล้วส่งเข้า partner; partner อนุมัติเองหรือ autoApprove
 */

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result === "" ? null : result;
}

function optionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseDate(value: unknown, field: string): Date {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`วันที่ ${field} ไม่ถูกต้อง`);
  }
  return date;
}

function paymentMethod(value: unknown): (typeof PAYMENT_METHODS)[number] {
  const method = text(value).toUpperCase();
  return (PAYMENT_METHODS as readonly string[]).includes(method)
    ? (method as (typeof PAYMENT_METHODS)[number])
    : "CASH";
}

// ---------- ลูกค้าจองรถ ----------

export async function createRentalBookingService(userId: string, data: any) {
  if (userId === "") {
    throw new Error("ต้องเข้าสู่ระบบก่อนจอง");
  }

  const vehicleId = text(data.vehicleId);
  if (vehicleId === "") {
    throw new Error("ต้องเลือกรถ");
  }

  const pickupAt = parseDate(data.pickupAt, "รับรถ");
  const dropoffAt = parseDate(data.dropoffAt, "คืนรถ");
  if (dropoffAt.getTime() <= pickupAt.getTime()) {
    throw new Error("วันคืนรถต้องหลังวันรับรถ");
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { partner: { select: { id: true, status: true, autoApprove: true, commissionRate: true } } },
  });
  if (!vehicle || vehicle.status !== "PUBLISHED") {
    throw new Error("รถไม่พร้อมให้จอง");
  }
  if (!vehicle.partner || vehicle.partner.status !== "VERIFIED") {
    throw new Error("รถไม่พร้อมให้จอง");
  }
  if (!vehicle.branchId) {
    throw new Error("รถคันนี้ยังไม่ผูกสาขา");
  }

  const days = rentalDays(pickupAt, dropoffAt);
  if (days < vehicle.minRentalDays) {
    throw new Error(`ต้องเช่าอย่างน้อย ${vehicle.minRentalDays} วัน`);
  }
  if (vehicle.maxRentalDays && days > vehicle.maxRentalDays) {
    throw new Error(`เช่าได้ไม่เกิน ${vehicle.maxRentalDays} วัน`);
  }

  const conflict = await findVehicleConflict(vehicleId, pickupAt, dropoffAt);
  if (conflict === "BOOKED") {
    throw new Error("รถถูกจองในช่วงเวลานี้แล้ว");
  }
  if (conflict === "BLOCKED") {
    throw new Error("รถไม่ว่างในช่วงเวลานี้");
  }

  const settings = await getRentalSettings();
  const quote = quoteRental({
    pricePerDay: vehicle.pricePerDay,
    depositAmount: vehicle.depositAmount,
    days,
    settings,
    commissionRate: vehicle.partner.commissionRate,
  });

  const autoApprove = vehicle.partner.autoApprove;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        ref: makeRentalRef(),
        userId,
        type: "TRANSPORT",
        status: "UPCOMING",
        totalPrice: quote.rentalTotal,
        travelDate: pickupAt,
        checkIn: pickupAt,
        checkOut: dropoffAt,
        vehicleId,
      },
    });

    const rental = await tx.rentalDetail.create({
      data: {
        bookingId: booking.id,
        status: autoApprove ? "RESERVED" : "PENDING_PARTNER",
        rentalMode: "SELF_DRIVE",
        ratePlan: "DAILY",
        vehicleId,
        branchId: vehicle.branchId!,
        dropoffBranchId: vehicle.branchId!,
        pickupAt,
        dropoffAt,
        days,
        pricePerDay: vehicle.pricePerDay,
        depositAmount: vehicle.depositAmount,
        addOns: data.addOns && typeof data.addOns === "object" ? data.addOns : undefined,
        driverName: optionalText(data.driverName),
        driverPhone: optionalText(data.driverPhone),
        driverLicenseNo: optionalText(data.driverLicenseNo),
        notes: optionalText(data.notes),
        ...(autoApprove ? { approvedAt: now } : {}),
      },
    });

    return { booking, rental };
  });

  return await getRentalForCustomerService(result.booking.id, userId);
}

async function getRentalForCustomerService(bookingId: string, userId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: {
      rentalDetail: {
        include: {
          vehicle: {
            select: {
              id: true,
              name: true,
              brand: true,
              imageUrl: true,
              transmission: true,
              fuelType: true,
              seats: true,
            },
          },
          branch: { select: { id: true, name: true, address: true, phone: true } },
        },
      },
    },
  });
  if (!booking) {
    throw new Error("ไม่พบการจอง");
  }
  return booking;
}

// ---------- ลูกค้ายกเลิก ----------

export async function cancelRentalBookingService(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { rentalDetail: true },
  });
  if (!booking || !booking.rentalDetail) {
    throw new Error("ไม่พบการจอง");
  }
  if (booking.userId !== userId) {
    throw new Error("ไม่ใช่การจองของคุณ");
  }

  const rental = booking.rentalDetail;
  if (["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"].includes(rental.status)) {
    throw new Error("การจองนี้ยกเลิกไม่ได้แล้ว");
  }
  if (rental.status === "PICKED_UP") {
    throw new Error("รับรถไปแล้ว ยกเลิกไม่ได้");
  }

  const paid = rental.status === "PAID";

  return await prisma.$transaction(async (tx) => {
    if (paid && rental.depositAmount > 0) {
      // คืนมัดจำ แต่ไม่คืนค่าเช่า (ตามกติกา MVP)
      await tx.rentalDetail.update({
        where: { id: rental.id },
        data: {
          status: "CANCELLED",
          depositStatus: "REFUNDED",
          depositRefundedAt: new Date(),
        },
      });
    } else {
      await tx.rentalDetail.update({ where: { id: rental.id }, data: { status: "CANCELLED" } });
    }

    await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });

    return { bookingId: booking.id, rentalId: rental.id, paid, depositRefunded: paid };
  });
}

// ---------- Partner: รายการจอง ----------

async function ownedRental(partnerId: string, rentalId: string) {
  const rental = await prisma.rentalDetail.findFirst({
    where: { id: rentalId, vehicle: { partnerId } },
    include: {
      booking: { select: { id: true, ref: true, userId: true, status: true, totalPrice: true } },
      vehicle: { select: { id: true, name: true, licensePlate: true, pricePerDay: true } },
      branch: { select: { id: true, name: true, address: true } },
    },
  });
  if (!rental) {
    throw new Error("ไม่พบการจอง");
  }
  return rental;
}

const RENTAL_LIST_INCLUDE = {
  booking: {
    select: {
      id: true,
      ref: true,
      status: true,
      totalPrice: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  vehicle: { select: { id: true, name: true, licensePlate: true, imageUrl: true } },
  branch: { select: { id: true, name: true } },
} as const;

export async function listPartnerRentalsService(
  partnerId: string,
  status: string,
  page: number,
  size: number,
) {
  const skip = (page - 1) * size;
  const where = {
    vehicle: { partnerId },
    ...(status && status !== "ALL" ? { status: status as any } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.rentalDetail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: size,
      include: RENTAL_LIST_INCLUDE,
    }),
    prisma.rentalDetail.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function listVehicleRentalsService(
  partnerId: string,
  vehicleId: string,
  status: string,
  page: number,
  size: number,
) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, partnerId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }

  const skip = (page - 1) * size;
  const where = {
    vehicleId,
    ...(status && status !== "ALL" ? { status: status as any } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.rentalDetail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: size,
      include: RENTAL_LIST_INCLUDE,
    }),
    prisma.rentalDetail.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

// ---------- Partner: อนุมัติ / ตีกลับ ----------

export async function approveRentalService(partnerId: string, rentalId: string, partnerUserId: string) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "PENDING_PARTNER") {
    throw new Error("การจองนี้ไม่ได้รออนุมัติ");
  }

  const conflict = await findVehicleConflict(
    rental.vehicleId,
    rental.pickupAt,
    rental.dropoffAt,
    rental.id,
  );
  if (conflict !== null) {
    throw new Error("รถไม่ว่างแล้วในช่วงเวลานี้ ตีกลับอัตโนมัติ");
  }

  return await prisma.rentalDetail.update({
    where: { id: rental.id },
    data: { status: "RESERVED", approvedAt: new Date(), approvedBy: partnerUserId },
    include: RENTAL_LIST_INCLUDE,
  });
}

export async function rejectRentalService(partnerId: string, rentalId: string, reason: string) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "PENDING_PARTNER") {
    throw new Error("การจองนี้ไม่ได้รออนุมัติ");
  }
  if (reason === "") {
    throw new Error("ต้องใส่เหตุผลที่ตีกลับ");
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.rentalDetail.update({
      where: { id: rental.id },
      data: { status: "REJECTED", rejectedReason: reason },
      include: RENTAL_LIST_INCLUDE,
    });
    await tx.booking.update({ where: { id: rental.bookingId }, data: { status: "CANCELLED" } });
    return updated;
  });
}

// ---------- Partner: จ่ายเงินที่สาขา / รับรถ / คืนรถ / จบงาน ----------

export async function payRentalAtBranchService(partnerId: string, rentalId: string, data: any) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "RESERVED") {
    throw new Error("ต้องอนุมัติการจองก่อนบันทึกการชำระเงิน");
  }

  const partner = await prisma.vehiclePartner.findUnique({
    where: { id: partnerId },
    select: { commissionRate: true },
  });
  const settings = await getRentalSettings();
  const quote = quoteRental({
    pricePerDay: rental.pricePerDay,
    depositAmount: rental.depositAmount,
    days: rental.days,
    settings,
    commissionRate: partner?.commissionRate ?? null,
  });

  const method = paymentMethod(data.method);
  const receivedBy = optionalText(data.receivedBy);
  const receiptNo = optionalText(data.receiptNo);
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    if (rental.depositAmount > 0) {
      await tx.payment.create({
        data: {
          rentalId: rental.id,
          type: "DEPOSIT",
          method,
          amount: rental.depositAmount,
          baseAmount: rental.depositAmount,
          vatAmount: 0,
          receiptNo,
          receivedBy,
          paidAt: now,
        },
      });
    }

    await tx.payment.create({
      data: {
        rentalId: rental.id,
        type: "RENTAL",
        method,
        amount: quote.rentalTotal,
        baseAmount: quote.baseAmount,
        vatAmount: quote.vatAmount,
        receiptNo,
        receivedBy,
        paidAt: now,
      },
    });

    // เก็บ snapshot ค่าคอม ณ เวลาที่เก็บเงิน (ฐาน = ค่าเช่าก่อน VAT ไม่รวมมัดจำ)
    await tx.partnerEarning.upsert({
      where: { rentalId: rental.id },
      create: {
        rentalId: rental.id,
        partnerId,
        vehicleId: rental.vehicleId,
        grossAmount: quote.baseAmount,
        commissionRate: quote.commissionRate,
        commission: quote.commission,
        netAmount: quote.netToPartner,
        status: "PENDING",
      },
      update: {
        grossAmount: quote.baseAmount,
        commissionRate: quote.commissionRate,
        commission: quote.commission,
        netAmount: quote.netToPartner,
      },
    });

    return await tx.rentalDetail.update({
      where: { id: rental.id },
      data: {
        status: "PAID",
        paidAt: now,
        ...(rental.depositAmount > 0 ? { depositStatus: "PAID" } : {}),
      },
      include: { ...RENTAL_LIST_INCLUDE, payments: true },
    });
  });
}

export async function pickupRentalService(partnerId: string, rentalId: string, data: any) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "PAID") {
    throw new Error("ต้องชำระเงินก่อนรับรถ");
  }

  return await prisma.rentalDetail.update({
    where: { id: rental.id },
    data: {
      status: "PICKED_UP",
      pickedUpAt: new Date(),
      mileageOut: optionalInt(data.mileageOut),
      fuelOut: optionalText(data.fuelOut),
    },
    include: RENTAL_LIST_INCLUDE,
  });
}

export async function returnRentalService(partnerId: string, rentalId: string, data: any) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "PICKED_UP") {
    throw new Error("รถยังไม่ถูกนำออกไป หรือคืนไปแล้ว");
  }

  const settings = await getRentalSettings();
  const now = new Date();
  const late = lateFeeFor(rental.dropoffAt, now, settings);
  const method = paymentMethod(data.method);

  return await prisma.$transaction(async (tx) => {
    // เก็บค่าคืนช้าเป็นรายการชำระเงินแยก (ถ้ามี)
    if (late.lateFee > 0) {
      await tx.payment.create({
        data: {
          rentalId: rental.id,
          type: "LATE_FEE",
          method,
          amount: late.lateFee,
          baseAmount: late.lateFee,
          vatAmount: 0,
          receivedBy: optionalText(data.receivedBy),
          note: `คืนช้า ${late.lateMinutes} นาที (${late.billableHours} ชม.)`,
          paidAt: now,
        },
      });
    }

    return await tx.rentalDetail.update({
      where: { id: rental.id },
      data: {
        status: "RETURNED",
        returnedAt: now,
        mileageIn: optionalInt(data.mileageIn),
        fuelIn: optionalText(data.fuelIn),
        lateMinutes: late.lateMinutes,
        lateFee: late.lateFee,
      },
      include: { ...RENTAL_LIST_INCLUDE, payments: true },
    });
  });
}

export async function completeRentalService(partnerId: string, rentalId: string) {
  const rental = await ownedRental(partnerId, rentalId);
  if (rental.status !== "RETURNED") {
    throw new Error("ต้องคืนรถก่อนปิดงาน");
  }

  const now = new Date();
  const refundDeposit = rental.depositStatus === "PAID" && rental.depositAmount > 0;

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.rentalDetail.update({
      where: { id: rental.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        ...(refundDeposit
          ? { depositStatus: "REFUNDED", depositRefundedAt: now }
          : {}),
      },
      include: RENTAL_LIST_INCLUDE,
    });
    await tx.booking.update({ where: { id: rental.bookingId }, data: { status: "COMPLETED" } });
    return updated;
  });
}

/** ลูกค้าไม่มารับรถ → ยึดมัดจำ (ถ้าจ่ายแล้ว) */
export async function markNoShowService(partnerId: string, rentalId: string, data: any) {
  const rental = await ownedRental(partnerId, rentalId);
  if (!["RESERVED", "PAID"].includes(rental.status)) {
    throw new Error("ทำเครื่องหมายไม่มารับรถได้เฉพาะการจองที่อนุมัติแล้ว");
  }

  const forfeit = rental.status === "PAID" && rental.depositAmount > 0;

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.rentalDetail.update({
      where: { id: rental.id },
      data: {
        status: "NO_SHOW",
        notes: optionalText(data?.notes) ?? rental.notes,
        ...(forfeit ? { depositStatus: "FORFEITED" } : {}),
      },
      include: RENTAL_LIST_INCLUDE,
    });
    await tx.booking.update({ where: { id: rental.bookingId }, data: { status: "CANCELLED" } });
    return updated;
  });
}

// ---------- Partner: รายได้ ----------

export async function getPartnerEarningsService(partnerId: string, page: number, size: number) {
  const skip = (page - 1) * size;

  const [items, total, all] = await Promise.all([
    prisma.partnerEarning.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      skip,
      take: size,
      include: {
        vehicle: { select: { id: true, name: true, licensePlate: true } },
        rental: {
          select: {
            id: true,
            pickupAt: true,
            dropoffAt: true,
            status: true,
            booking: { select: { ref: true } },
          },
        },
      },
    }),
    prisma.partnerEarning.count({ where: { partnerId } }),
    prisma.partnerEarning.findMany({
      where: { partnerId },
      select: { grossAmount: true, commission: true, netAmount: true, status: true },
    }),
  ]);

  const sum = (rows: typeof all, key: "grossAmount" | "commission" | "netAmount") =>
    rows.reduce((acc, row) => acc + row[key], 0);

  return {
    summary: {
      gross: sum(all, "grossAmount"),
      commission: sum(all, "commission"),
      net: sum(all, "netAmount"),
      pendingNet: sum(all.filter((row) => row.status === "PENDING"), "netAmount"),
      paidNet: sum(all.filter((row) => row.status === "PAID"), "netAmount"),
      count: all.length,
    },
    items,
    total,
    page,
    size,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}
