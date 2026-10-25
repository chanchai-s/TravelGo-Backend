import { Request, Response } from 'express';
import {
  upsertProperty, 
  getPropertyByIdService, 
  patchPropertyService, 
  deletePropertyService,
  applyAsHostService,
  addVerificationDocumentService,
  getHostProfileService,
  listMyStaysService,
  hostDashboardService,
  setStopSellService,
  listStopSellService
} from '../services/host.services';
import { resubmitStayService } from '../services/admin.services';
import {
  acceptContractService,
  getPayoutService,
  savePayoutService,
} from '../services/payout.services';

export async function saveProperty(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    const result = await upsertProperty(propertyId, req.body, userId);
    return res.status(200).json({
      status: true,
      message: `Successfully saved step ${req.body.currentStep || 1}`,
      data: result,
    });
  } catch (error: any) {
    const code = /Login required/.test(error.message)
      ? 401
      : /HostProfile not found/.test(error.message)
        ? 400
        : /Host not verified|Not your property|Invalid draft key/.test(error.message)
          ? 403
          : /กรุณาเพิ่มรูปภาพ|กรุณาเพิ่มประเภทห้อง|กรุณากรอกราคา|มีประกาศชื่อและทำเลนี้อยู่แล้ว/.test(
              error.message,
            )
            ? 400
            : 500;
    return res.status(code).json({ status: false, message: error.message });
  }
}

export async function getProperty(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  const draftKey = typeof req.query.draftKey === "string" ? req.query.draftKey : undefined;
  try {
    const result = await getPropertyByIdService(propertyId, userId, draftKey);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const code =
      error.message === "Property not found"
        ? 404
        : error.message === "Not your property" || error.message === "Invalid draft key"
          ? 403
          : 500;
return res.status(code).json({ success: false, message: error.message });
  }
}

export async function patchProperty(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    const result = await patchPropertyService(propertyId, req.body, userId);
    return res.status(200).json({
      status: true,
      message: result.mustReReview
        ? 'บันทึกแล้ว และส่งกลับเข้าคิวตรวจเพราะแก้ไขข้อมูลสำคัญ'
        : 'Property updated successfully',
      data: result,
    });
  } catch (error: any) {
    const code =
      error.message === "Property not found"
        ? 404
        : error.message === "Not your property" || error.message === "Invalid draft key"
          ? 403
          : 500;
    return res.status(code).json({ status: false, message: error.message });
  }
}

export async function deleteProperty(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    await deletePropertyService(propertyId, userId);
    return res.status(200).json({ status: true, message: 'Property deleted successfully' });
  } catch (error: any) {
    const code =
      error.message === "Property not found"
        ? 404
        : error.message === "Not your property"
          ? 403
          : 500;
    return res.status(code).json({ status: false, message: error.message });
  }
}

// ---------- สมัครเป็น Partner ----------

export async function applyAsHost(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  const { displayName, accountType, taxId, contactName, contactPhone } = req.body ?? {};
  try {
    const host = await applyAsHostService(userId, { displayName, accountType, taxId, contactName, contactPhone });
    return res.status(200).json({ success: true, message: 'ส่งคำขอเป็นพันธมิตรแล้ว รอตรวจสอบ', data: host });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function addVerificationDocument(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  const { docType, fileUrl } = req.body ?? {};
  if (!docType || !fileUrl) {
    return res.status(400).json({ success: false, message: 'ต้องระบุ docType และ fileUrl' });
  }
  try {
    const doc = await addVerificationDocumentService(userId, String(docType), String(fileUrl));
    return res.status(200).json({ success: true, message: 'เพิ่มเอกสารแล้ว', data: doc });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMyHostProfile(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const host = await getHostProfileService(userId);
    return res.status(200).json({ success: true, data: host });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ส่งประกาศเข้าคิวตรวจใหม่ (เจ้าของกดหลังถูกตีกลับ)
export async function resubmitProperty(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    const stay = await resubmitStayService(propertyId, userId);
    return res.status(200).json({ success: true, message: 'ส่งเข้าคิวตรวจแล้ว', data: stay });
  } catch (error: any) {
    const code =
      error.message === "Property not found"
        ? 404
        : error.message === "Not your property"
          ? 403
          : error.message === "Cannot resubmit"
            ? 400
            : 500;
    return res.status(code).json({ success: false, message: error.message });
  }
}

// ---------- ประกาศของฉัน ----------

export async function listMyStays(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    return res.status(200).json({ success: true, data: await listMyStaysService(userId) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function hostDashboard(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    return res.status(200).json({ success: true, data: await hostDashboardService(userId) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ---------- ปิดขายรายวัน ----------

export async function setStopSell(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    const result = await setStopSellService(propertyId, userId, req.body ?? {});
    return res.status(200).json({ success: true, message: 'บันทึกวันที่ปิดขายแล้ว', data: result });
  } catch (error: any) {
    const code = error.message === 'Property not found' ? 404
      : error.message === 'Not your property' ? 403 : 500;
    return res.status(code).json({ success: false, message: error.message });
  }
}

export async function listStopSell(req: Request, res: Response) {
  const { propertyId } = req.params as { propertyId: string };
  const userId = req.user?.id ?? "";
  try {
    return res.status(200).json({ success: true, data: await listStopSellService(propertyId, userId) });
  } catch (error: any) {
    const code = error.message === 'Property not found' ? 404
      : error.message === 'Not your property' ? 403 : 500;
    return res.status(code).json({ success: false, message: error.message });
  }
}

// ---------- บัญชีรับเงิน + สัญญา ----------

export async function savePayout(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  const { bankName, accountHolder, accountNumber } = req.body ?? {};
  if (!bankName || !accountHolder || !accountNumber) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลบัญชีให้ครบ' });
  }
  try {
    const host = await getHostProfileService(userId);
    if (!host) {
      return res.status(400).json({ success: false, message: 'ยังไม่ได้สมัครเป็นเจ้าของที่พัก' });
    }
    await savePayoutService(host.id, { bankName, accountHolder, accountNumber });
    return res.status(200).json({ success: true, message: 'บันทึกบัญชีรับเงินแล้ว รอแอดมินตรวจ' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getPayout(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const host = await getHostProfileService(userId);
    if (!host) {
      return res.status(200).json({ success: true, data: null });
    }
    return res.status(200).json({ success: true, data: await getPayoutService(host.id) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function acceptContract(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  const version = String(req.body?.version ?? "");
  if (version === "") {
    return res.status(400).json({ success: false, message: 'ไม่พบเวอร์ชันข้อกำหนด' });
  }
  try {
    const host = await getHostProfileService(userId);
    if (!host) {
      return res.status(400).json({ success: false, message: 'ยังไม่ได้สมัครเป็นเจ้าของที่พัก' });
    }
    await acceptContractService(host.id, version);
    return res.status(200).json({ success: true, message: 'บันทึกการยอมรับข้อกำหนดแล้ว' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}