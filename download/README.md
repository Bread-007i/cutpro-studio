Here are all the generated files.
# ตัดต่อโปร Studio สำหรับ Windows

## สร้างตัวติดตั้งและหน้าเว็บดาวน์โหลด

ต้องใช้ Windows 10/11 64-bit, Node.js 20 ขึ้นไป และ npm:

```powershell
npm install
npm run desktop:publish
```

คำสั่งจะ build แอป, สร้างตัวติดตั้ง, แล้วจัดไฟล์ installer และ SHA-256 ไว้ให้หน้าเว็บดาวน์โหลด จากนั้นเปิดหน้าเว็บที่ `/download` เมื่อตัว Next.js server ทำงานเสร็จ:

```text
npm run start
http://localhost:3000/download
```

คำสั่งจะสร้างไฟล์ติดตั้งไว้ที่ `release\CutPro-Studio-Setup-<version>-x64.exe` และคัดลอก `release.json` ไว้ที่ `public\download\release.json` สำหรับตรวจสอบค่า SHA-256 จากนั้นสร้าง GitHub Release ด้วย tag `v<version>` และแนบไฟล์ installer กับ `release.json` เป็น assets (อย่า commit ไฟล์ `.exe` ลง Git เพราะมีขนาดใหญ่) หน้า `/download` จะดาวน์โหลดจาก GitHub Release โดยตรง

ผู้ใช้กดปุ่มดาวน์โหลดแล้วดูเปอร์เซ็นต์จริงจาก Chrome/Edge ที่ Downloads (`Ctrl+J`) เมื่อเปิดไฟล์ติดตั้ง โปรแกรมติดตั้งจะแสดงเปอร์เซ็นต์การติดตั้งและสร้างทางลัด CutPro Studio บน Desktop/Start Menu

## Windows แจ้งเตือนความปลอดภัย

ตัวติดตั้งที่ build เองยังไม่มีลายเซ็นดิจิทัลจากผู้เผยแพร่ที่ผ่านการยืนยัน Windows SmartScreen จึงอาจแจ้งว่าไม่รู้จักผู้เผยแพร่ และ Microsoft Defender อาจตรวจไฟล์ใหม่ผิดพลาดได้ **อย่าปิด Defender หรือเพิ่มข้อยกเว้นเพื่อข้ามการเตือนว่าเป็นไวรัส** หาก Defender ระบุว่าเป็นภัยคุกคาม ให้หยุดใช้งานและส่งไฟล์ผ่าน Microsoft Security Intelligence เพื่อวิเคราะห์ false positive ก่อนเผยแพร่ควรลงนามด้วยใบรับรอง Authenticode ที่เชื่อถือได้และตรวจสถานะไฟล์ทุกครั้ง

สำหรับผู้ดูแลการเผยแพร่ที่มีใบรับรองโค้ดซิงก์: ตั้งค่า `CSC_LINK` และ `CSC_KEY_PASSWORD` ใน environment ของเครื่อง build ที่ปลอดภัยก่อนสั่ง build ห้ามเก็บไฟล์ใบรับรองหรือรหัสผ่านไว้ใน repository

> การ build นี้สร้าง Windows x64 installer เท่านั้น การดาวน์โหลด installer จากอินเทอร์เน็ตจะแสดงเปอร์เซ็นต์โดย Chrome/Edge ส่วนเปอร์เซ็นต์ในตัวแอปแสดงตามขั้นตอนเริ่มเซิร์ฟเวอร์/กู้คืนโปรเจกต์จริง
