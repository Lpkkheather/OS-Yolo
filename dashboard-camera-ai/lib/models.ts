// โมเดลที่เลือกได้ในหน้า "ตั้งค่าการนับ" = ที่ export เป็น NCNN ไว้ใน YOLO_Pi/models (บอร์ดตรวจซ้ำว่ามีไฟล์จริง)
// ไฟล์นี้ไม่ import อะไร: ใช้ได้ทั้งฝั่งเบราว์เซอร์ (ZoneEditor) และ server (/stats/zones ตรวจค่าก่อนบันทึก)
export const MODEL_NAMES = ["yolo26n_trained", "yolo26n", "yolo11n_trained", "yolo11n"] as const;
export const MODEL_SIZES = [320, 640] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
export type ModelSize = (typeof MODEL_SIZES)[number];
