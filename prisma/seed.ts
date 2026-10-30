import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST ?? "localhost",
  user: process.env.DATABASE_USER ?? "root",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "travel_app",
  connectionLimit: 2,
});

const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { id: "cat-economy", slug: "economy", name: "Economy", sortOrder: 1 },
  { id: "cat-compact-suv", slug: "compact-suv", name: "Compact SUV", sortOrder: 2 },
  { id: "cat-sedan", slug: "sedan", name: "Sedan", sortOrder: 3 },
  { id: "cat-suv", slug: "suv", name: "SUV", sortOrder: 4 },
  { id: "cat-luxury", slug: "luxury", name: "Luxury", sortOrder: 5 },
  { id: "cat-van", slug: "van", name: "Van / MPV", sortOrder: 6 },
  { id: "cat-pickup", slug: "pickup", name: "Pickup Truck", sortOrder: 7 },
  { id: "cat-ev", slug: "ev", name: "EV", sortOrder: 8 },
];

const SETTINGS = [
  { key: "vat_rate", value: "7" },
  { key: "late_fee_per_hour", value: "200" },
  { key: "late_grace_minutes", value: "60" },
  { key: "default_commission_rate", value: "20" },
];

const IMAGES = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD69UBTTzXXJ7Dtq8dVngIlAPxTOWNQehbkvEvq-bROeBuLv1lmKPHXqP4owmg-2BUu5u9PLQwLFMYjhYzoNS_furzMAiuvhnKIjiqK8yZ4ZUsrx6zF_cztays0JY7vD4BH9snh2NugDeFbtoQP2WOkesboAKC-lwbNUyZGMu9aNAjhtLbLQyyRbboC4aGt99WQzFqmytYTTJm_WvaJzAeJKh_Q4wZE4OfKxltD_SE56MvGG9zABhfcsw",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCIdArc9hRzQgcGrjp_p4BW9yCIGORQGGJv0TYe2crmpR5zEUkywJaDRXlVtnaqvhii8nNcvBBb8CBTNX2yZlcCNjuLN2mpahKm8lEBW0xwOC7bJDZLAoxJrA1wGqsPJcnah7msV5YSsULZMXUnoZHuEcxZ7FbWprBs20AWhhGinrF3OK70bcuAtwpA7dQsMxtHBbxgf-pAFg5fjECqy-ebiRPuoBjv9S6bqRoGk7gjVJ8YNwP9rGVOQw",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBXxLcPg2UuN9vQ6UsOreSX7tH1xsoleKLSEpE_U_P2Abz46zhQOIOCrwssIktyGQ0LAkSNHQE0KCmvmx6PlPgKzKLR8UpxRwfugi0TcjAvgchb9zAiNPh1ht6lqGGImGDKnm7i_tcpy5-amshXkF0-7wSDNXopapKF6PA8wfok-pJ8qQE4J-aBfKv7wXYiM9UuebuuhPPltm8fr-To7TKggAXtQ9oygrvnSNuO0HxKogZvvRfURVUbJA",
];

async function main() {
  for (const setting of SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { value: setting.value },
    });
  }

  for (const category of CATEGORIES) {
    await prisma.vehicleCategory.upsert({
      where: { id: category.id },
      create: category,
      update: { slug: category.slug, name: category.name, sortOrder: category.sortOrder },
    });
  }

  const user = await prisma.user.upsert({
    where: { email: "rental.partner@example.com" },
    create: { email: "rental.partner@example.com", name: "Demo Rental Partner", phone: "021234567" },
    update: {},
  });

  const partner = await prisma.vehiclePartner.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: "VERIFIED",
      companyName: "Demo Rentals Co., Ltd.",
      taxId: "0105566000000",
      companyRegNo: "0105566000000",
      vatRegistered: true,
      address: "99/1 Sukhumvit Rd., Bangkok 10250",
      contactName: "Somchai Demo",
      contactPhone: "0812345678",
      contactEmail: "rental.partner@example.com",
      commissionRate: 20,
      autoApprove: false,
      contractVersion: "v1",
      contractAcceptedAt: new Date(),
      verifiedAt: new Date(),
    },
    update: {},
  });

  const branches = [
    {
      id: "seed-branch-suvarnabhumi",
      name: "สาขาสุวรรณภูมิ",
      address: "999 หมู่ 1 ถ.บางนา-ตราด สมุทรปราการ 10540",
      latitude: 13.6900,
      longitude: 100.7501,
      phone: "021234568",
      openHours: "07:00-22:00",
    },
    {
      id: "seed-branch-silom",
      name: "สาขาสีลม",
      address: "88 ถ.สีลม เขตบางรัก กรุงเทพฯ 10500",
      latitude: 13.7292,
      longitude: 100.5347,
      phone: "021234569",
      openHours: "08:00-20:00",
    },
  ];

  for (const branch of branches) {
    await prisma.partnerBranch.upsert({
      where: { id: branch.id },
      create: { ...branch, partnerId: partner.id },
      update: { ...branch, partnerId: partner.id },
    });
  }

  const vehicles = [
    {
      id: "seed-vehicle-yaris-ativ",
      categoryId: "cat-economy",
      branchId: "seed-branch-suvarnabhumi",
      name: "Toyota Yaris Ativ",
      brand: "Toyota",
      modelYear: 2024,
      seats: 5,
      bags: 2,
      transmission: "AUTO",
      fuelType: "PETROL",
      pricePerDay: 1200,
      depositAmount: 3000,
      specs: { doors: 4, engineCc: 1200, driveType: "FWD" },
    },
    {
      id: "seed-vehicle-hrv",
      categoryId: "cat-compact-suv",
      branchId: "seed-branch-silom",
      name: "Honda HR-V",
      brand: "Honda",
      modelYear: 2024,
      seats: 5,
      bags: 3,
      transmission: "AUTO",
      fuelType: "HYBRID",
      pricePerDay: 1800,
      depositAmount: 5000,
      specs: { doors: 5, engineCc: 1500, driveType: "FWD" },
    },
    {
      id: "seed-vehicle-bmw-3",
      categoryId: "cat-luxury",
      branchId: "seed-branch-silom",
      name: "BMW 3 Series",
      brand: "BMW",
      modelYear: 2023,
      seats: 5,
      bags: 2,
      transmission: "AUTO",
      fuelType: "PETROL",
      pricePerDay: 3500,
      depositAmount: 10000,
      specs: { doors: 4, engineCc: 2000, driveType: "RWD" },
    },
    {
      id: "seed-vehicle-commuter",
      categoryId: "cat-van",
      branchId: "seed-branch-suvarnabhumi",
      name: "Toyota Commuter",
      brand: "Toyota",
      modelYear: 2022,
      seats: 10,
      bags: 6,
      transmission: "MANUAL",
      fuelType: "DIESEL",
      pricePerDay: 2500,
      depositAmount: 8000,
      specs: { doors: 4, engineCc: 2800, driveType: "RWD" },
    },
    {
      id: "seed-vehicle-atto3",
      categoryId: "cat-ev",
      branchId: "seed-branch-suvarnabhumi",
      name: "BYD Atto 3",
      brand: "BYD",
      modelYear: 2024,
      seats: 5,
      bags: 2,
      transmission: "AUTO",
      fuelType: "EV",
      pricePerDay: 1600,
      depositAmount: 5000,
      specs: { doors: 5, rangeKm: 480, driveType: "FWD" },
    },
  ];

  for (const [index, vehicle] of vehicles.entries()) {
    const category = CATEGORIES.find((c) => c.id === vehicle.categoryId);
    const mainImage = IMAGES[index % IMAGES.length]!;
    const secondImage = IMAGES[(index + 1) % IMAGES.length]!;
    const data = {
      ...vehicle,
      partnerId: partner.id,
      category: category?.slug ?? "economy",
      vendor: partner.companyName,
      description: "รถเช่าพร้อมใช้งานจาก Demo Rentals",
      status: "PUBLISHED" as const,
      imageUrl: mainImage,
    };

    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      create: data,
      update: data,
    });

    await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: vehicle.id } });
    await prisma.vehiclePhoto.createMany({
      data: [
        { vehicleId: vehicle.id, url: mainImage, isPrimary: true, sortOrder: 0 },
        { vehicleId: vehicle.id, url: secondImage, isPrimary: false, sortOrder: 1 },
      ],
    });
  }

  const counts = {
    categories: await prisma.vehicleCategory.count(),
    partners: await prisma.vehiclePartner.count(),
    branches: await prisma.partnerBranch.count(),
    vehicles: await prisma.vehicle.count(),
    settings: await prisma.platformSetting.count(),
  };

  console.log("Seed completed:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
