const { writeFileSync } = require('fs');
const { join, resolve } = require('path');

const DATA_DIR = resolve(__dirname, '../YOLO_Pi/data');

// สร้างข้อมูล 2026-10-09 (วันอาทิตย์ก่อน) - มีข้อมูล 08:00-20:00
const data09 = `time,seconds,camera,in,out,in_zone_avg,in_zone_max,visitors,in_today,out_today,visitors_today,fps,cpu_temp_c,model
2026-10-09T08:00:00+07:00,60,cam1,15,3,12,20,10,15,3,18,15.2,45,yolo11n_640
2026-10-09T09:00:00+07:00,60,cam1,25,8,18,30,15,40,11,35,14.8,48,yolo11n_640
2026-10-09T10:00:00+07:00,60,cam1,30,12,22,35,20,70,23,55,14.5,52,yolo11n_640
2026-10-09T11:00:00+07:00,60,cam1,35,18,25,40,22,105,41,80,14.2,58,yolo11n_640
2026-10-09T12:00:00+07:00,60,cam1,40,25,28,45,25,145,66,110,13.8,62,yolo11n_640
2026-10-09T13:00:00+07:00,60,cam1,35,30,26,42,20,180,96,135,13.5,65,yolo11n_640
2026-10-09T14:00:00+07:00,60,cam1,30,35,24,38,18,210,131,155,13.2,63,yolo11n_640
2026-10-09T15:00:00+07:00,60,cam1,25,40,22,35,15,235,171,170,13.0,60,yolo11n_640
2026-10-09T16:00:00+07:00,60,cam1,20,30,20,30,12,255,201,182,13.5,58,yolo11n_640
2026-10-09T17:00:00+07:00,60,cam1,15,25,18,25,10,270,226,192,14.0,55,yolo11n_640
2026-10-09T18:00:00+07:00,60,cam1,10,20,15,20,8,280,246,198,14.5,52,yolo11n_640
2026-10-09T19:00:00+07:00,60,cam1,8,15,12,18,5,288,261,203,15.0,50,yolo11n_640
2026-10-09T20:00:00+07:00,60,cam1,5,10,10,15,3,293,271,206,15.2,48,yolo11n_640
`;
writeFileSync(join(DATA_DIR, '2026-10-09.csv'), data09);
console.log('Created 2026-10-09.csv');

// สร้างข้อมูล 2026-10-04 (7 วันที่แล้ว - วันอาทิตย์)
const data04 = `time,seconds,camera,in,out,in_zone_avg,in_zone_max,visitors,in_today,out_today,visitors_today,fps,cpu_temp_c,model
2026-10-04T08:00:00+07:00,60,cam1,12,2,10,18,8,12,2,15,15.0,44,yolo11n_640
2026-10-04T09:00:00+07:00,60,cam1,22,6,15,25,12,34,8,28,14.8,47,yolo11n_640
2026-10-04T10:00:00+07:00,60,cam1,28,10,18,30,16,62,18,48,14.5,51,yolo11n_640
2026-10-04T11:00:00+07:00,60,cam1,32,15,20,35,18,94,33,70,14.2,56,yolo11n_640
2026-10-04T12:00:00+07:00,60,cam1,38,22,24,40,22,132,55,95,13.8,60,yolo11n_640
2026-10-04T13:00:00+07:00,60,cam1,33,28,22,38,18,165,83,118,13.5,63,yolo11n_640
2026-10-04T14:00:00+07:00,60,cam1,28,32,20,35,15,193,115,135,13.2,61,yolo11n_640
2026-10-04T15:00:00+07:00,60,cam1,22,38,18,32,12,215,153,150,13.0,58,yolo11n_640
2026-10-04T16:00:00+07:00,60,cam1,18,28,16,28,10,233,181,162,13.5,56,yolo11n_640
2026-10-04T17:00:00+07:00,60,cam1,12,22,14,24,8,245,203,172,14.0,53,yolo11n_640
2026-10-04T18:00:00+07:00,60,cam1,8,18,12,20,5,253,221,180,14.5,51,yolo11n_640
2026-10-04T19:00:00+07:00,60,cam1,5,12,10,16,3,258,233,185,15.0,49,yolo11n_640
2026-10-04T20:00:00+07:00,60,cam1,3,8,8,12,2,261,241,188,15.2,47,yolo11n_640
`;
writeFileSync(join(DATA_DIR, '2026-10-04.csv'), data04);
console.log('Created 2026-10-04.csv');

// สร้างข้อมูล 2026-10-05, 06, 07, 08 (เฉลี่ย 7 วัน)
for (const date of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08']) {
  const lines = ['time,seconds,camera,in,out,in_zone_avg,in_zone_max,visitors,in_today,out_today,visitors_today,fps,cpu_temp_c,model'];
  let inSum = 0, outSum = 0, visSum = 0;
  for (let h = 8; h <= 20; h++) {
    const inHour = Math.floor(Math.random() * 20) + 10;
    const outHour = Math.floor(Math.random() * 15) + 5;
    inSum += inHour; outSum += outHour; visSum += Math.floor(inHour * 0.5);
    lines.push(`${date}T${String(h).padStart(2,'0')}:00:00+07:00,60,cam1,${inHour},${outHour},${Math.max(1, inSum-outSum)*0.4},${Math.max(1, inSum-outSum)},${Math.floor(inHour*0.5)},${inSum},${outSum},${visSum},14.5,${50+Math.floor(Math.random()*10)},yolo11n_640`);
  }
  writeFileSync(join(DATA_DIR, `${date}.csv`), lines.join('\n'));
  console.log(`Created ${date}.csv`);
}
console.log('Done creating test data');