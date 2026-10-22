import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { TextField } from "@/components/app/Field";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import PageMeta from "@/components/common/PageMeta";
import { CameraGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABEL, auth, fullName, useUser, type SessionUser } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useRef, useState } from "react";

// Crop to a centred square and shrink to 256px so uploads stay tiny.
async function squareThumb(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
  if (!jpeg) throw new Error("แปลงรูปไม่สำเร็จ");
  return jpeg;
}

export default function Profile() {
  const user = useUser();
  const [first, setFirst] = useState(user.firstName);
  const [last, setLast] = useState(user.lastName);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dirty = first.trim() !== user.firstName || last.trim() !== user.lastName;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim()) return toast.error("กรุณากรอกชื่อ");
    setBusy(true);
    try {
      const r = await api.patch<{ user: SessionUser }>("/profile", { firstName: first, lastName: last });
      auth.setUser(r.user);
      toast.success("บันทึกแล้ว");
    } catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      const blob = await squareThumb(f);
      const r = await api.putImage<{ user: SessionUser }>("/profile/avatar", blob);
      auth.setUser(r.user);
      toast.success("เปลี่ยนรูปโปรไฟล์แล้ว (ลบรูปเก่าออกแล้ว)");
    } catch (err) { toast.error(errorMessage(err)); }
    setPhotoBusy(false);
    if (file.current) file.current.value = "";
  };

  const remove = async () => {
    setPhotoBusy(true);
    try {
      const r = await api.del<{ user: SessionUser }>("/profile/avatar");
      auth.setUser(r.user);
      toast.success("ลบรูปโปรไฟล์แล้ว");
    } catch (err) { toast.error(errorMessage(err)); }
    setPhotoBusy(false);
  };

  return (
    <>
      <PageMeta title="โปรไฟล์ | IdlePark" description="แก้ไขชื่อและรูปโปรไฟล์" />
      <PageHeader title="โปรไฟล์" description="ใช้ภายในครอบครัว จึงมีเฉพาะข้อมูลที่จำเป็น" />
      <div className="mx-auto max-w-2xl space-y-4">
        <Card title="รูปโปรไฟล์">
          <div className="flex items-center gap-5">
            <UserAvatar id={user.id} name={fullName(user) || user.email} hasAvatar={user.hasAvatar} version={user.avatarVersion} size={88} />
            <div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<CameraGlyph />} loading={photoBusy} onClick={() => file.current?.click()}>{user.hasAvatar ? "เปลี่ยนรูป" : "เพิ่มรูป"}</Button>
                {user.hasAvatar && <Button variant="ghost" size="sm" disabled={photoBusy} onClick={remove}>ลบรูป</Button>}
              </div>
              <p className="mt-2 text-theme-xs text-gray-500">PNG, JPEG หรือ WebP · ระบบตัดเป็นสี่เหลี่ยมจัตุรัสและย่อให้อัตโนมัติ · รูปเก่าถูกลบทุกครั้งที่เปลี่ยน</p>
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="เลือกรูปโปรไฟล์" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        </Card>
        <Card title="ข้อมูลของฉัน">
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="ชื่อ" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
              <TextField label="นามสกุล" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
            </div>
            <TextField label="อีเมล" value={user.email} readOnly disabled hint="อีเมลเปลี่ยนได้โดยผู้ดูแลระบบ" />
            <TextField label="สิทธิ์ (Role)" value={ROLE_LABEL[user.role]} readOnly disabled hint="สิทธิ์กำหนดโดยผู้ดูแลระบบ" />
            <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!dirty}>บันทึก</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
