import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateIcon(size, filename) {
  const png = new PNG({
    width: size,
    height: size,
    filterType: -1
  });

  const centerX = size / 2;
  const centerY = size / 2;
  const circleRadius = size * 0.45;
  const greenColor = { r: 34, g: 197, b: 94, a: 255 }; // #22c55e

  // 绘制背景
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (png.width * y + x) << 2;
      
      // 计算到中心的距离
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= circleRadius) {
        // 圆形区域使用绿色
        png.data[idx] = greenColor.r;
        png.data[idx + 1] = greenColor.g;
        png.data[idx + 2] = greenColor.b;
        png.data[idx + 3] = greenColor.a;
      } else {
        // 背景透明
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }

  // 简单绘制一个树的图案（简单文字替代）
  drawSimpleText(png, size);

  // 保存文件
  const filePath = path.join(__dirname, 'public', filename);
  return new Promise((resolve, reject) => {
    const stream = png.pack().pipe(fs.createWriteStream(filePath));
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

function drawSimpleText(png, size) {
  // 绘制一个简单的白色圆圈作为装饰
  const centerX = size / 2;
  const centerY = size / 2;
  const innerRadius = size * 0.2;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 绘制简单的白色装饰
      if (Math.abs(distance - innerRadius) < 3) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      }
      
      // 绘制一个简单的白色加号/星星
      if ((Math.abs(dx) < 3 && Math.abs(dy) < size * 0.15) || 
          (Math.abs(dy) < 3 && Math.abs(dx) < size * 0.15)) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      }
    }
  }
}

async function main() {
  try {
    console.log('正在生成 PWA 图标...');
    
    // 确保 public 目录存在
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir);
    }
    
    const icon192 = await generateIcon(192, 'pwa-192x192.png');
    console.log('✓ 生成:', icon192);
    
    const icon512 = await generateIcon(512, 'pwa-512x512.png');
    console.log('✓ 生成:', icon512);
    
    console.log('\n🎉 PWA 图标生成成功！');
  } catch (error) {
    console.error('生成图标时出错:', error);
  }
}

main();
