const sharp = require('sharp');
const { prepareImages, MAX_BYTES } = require('../requests.attachments.validation');

const image = async (format = 'png') => ({
  originalname: `photo.${format === 'jpeg' ? 'jpg' : format}`,
  mimetype: `image/${format}`,
  buffer: await sharp({ create: { width: 3, height: 3, channels: 3, background: '#125abc' } })
    .toFormat(format)
    .toBuffer(),
});

test.each(['jpeg', 'png', 'webp'])('decodes and accepts real %s image content', async (format) => {
  const [prepared] = await prepareImages([await image(format)]);
  expect(prepared.contentType).toBe(`image/${format}`);
  expect(prepared.size).toBe(prepared.buffer.length);
  expect((await sharp(prepared.buffer).metadata()).format).toBe(format);
});

test('supports optional images and a maximum of five', async () => {
  expect(await prepareImages()).toEqual([]);
  const file = await image();
  expect(await prepareImages(Array(5).fill(file))).toHaveLength(5);
  await expect(prepareImages(Array(6).fill(file))).rejects.toMatchObject({ statusCode: 400 });
});

test.each([
  {
    originalname: 'fake.png',
    mimetype: 'image/png',
    buffer: Buffer.from('<script>alert(1)</script>'),
  },
  {
    originalname: 'fake.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from([255, 216, 255, 0, 1, 2]),
  },
  {
    originalname: 'fake.png',
    mimetype: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  },
  { originalname: 'animation.gif', mimetype: 'image/gif', buffer: Buffer.from('GIF89a') },
  { originalname: 'empty.png', mimetype: 'image/png', buffer: Buffer.alloc(0) },
])('rejects unsupported or damaged content: $originalname', async (file) => {
  await expect(prepareImages([file])).rejects.toMatchObject({ statusCode: 400 });
});

test('rejects an incorrect extension or MIME type even with valid image pixels', async () => {
  const png = await image();
  await expect(prepareImages([{ ...png, originalname: 'fake.jpg' }])).rejects.toThrow(
    'matching file contents'
  );
  await expect(prepareImages([{ ...png, mimetype: 'image/jpeg' }])).rejects.toThrow(
    'matching file contents'
  );
});

test('rejects files larger than 5 MB before decoding', async () => {
  await expect(
    prepareImages([
      { originalname: 'big.png', mimetype: 'image/png', buffer: Buffer.alloc(MAX_BYTES + 1) },
    ])
  ).rejects.toMatchObject({ statusCode: 413 });
});

test('removes paths, control characters and appended payloads from stored images', async () => {
  const png = await image();
  const [prepared] = await prepareImages([
    {
      ...png,
      originalname: '../folder/photo.png',
      buffer: Buffer.concat([png.buffer, Buffer.from('<script>payload</script>')]),
    },
  ]);
  expect(prepared.fileName).toBe('photo.png');
  expect(prepared.buffer.includes(Buffer.from('<script>payload</script>'))).toBe(false);
});
