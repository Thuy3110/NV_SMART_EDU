const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({
    where: { username },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    console.log('✅ Đã cập nhật mật khẩu cho tài khoản Quản trị viên:');
    console.log(updated);
  } else {
    const created = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName: 'Quản trị viên Hệ thống',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    console.log('✅ Đã tạo mới tài khoản Quản trị viên:');
    console.log(created);
  }

  console.log(`\n👉 Thông tin đăng nhập:`);
  console.log(`   - Tên đăng nhập: ${username}`);
  console.log(`   - Mật khẩu: ${password}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
