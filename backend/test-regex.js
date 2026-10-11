const regex = /^\d{4}-\d{2}-\d{2}$/;
console.log('regex source:', regex.source);
console.log('test 2026-10-10:', regex.test('2026-10-10'));

const d = '2026-10-10';
console.log('direct test:', /^\d{4}-\d{2}-\d{2}$/.test(d));
console.log('JSON:', JSON.stringify(d));