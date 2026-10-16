import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { PrismaClient, ProductType } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../src/lib/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { name },
      create: { name, permissions },
      update: { permissions },
    });
  }

  const roles = await prisma.role.findMany();
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  const users = [
    { name: 'Demo Admin', email: 'admin@demo.local', role: 'Admin' },
    { name: 'Demo Manager', email: 'manager@demo.local', role: 'Manager' },
    { name: 'Demo Sales', email: 'sales@demo.local', role: 'Sales' },
    { name: 'Demo Inventory', email: 'inventory@demo.local', role: 'Inventory' },
    { name: 'Demo Reader', email: 'readonly@demo.local', role: 'Read-only' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        roleId: roleByName[u.role].id,
      },
      update: {
        name: u.name,
        passwordHash,
        roleId: roleByName[u.role].id,
        isActive: true,
      },
    });
  }

  const gst = await prisma.taxRate.upsert({
    where: { id: 'seed-gst-18' },
    create: {
      id: 'seed-gst-18',
      name: 'GST 18% (example)',
      rate: 18,
      isActive: true,
    },
    update: { rate: 18, isActive: true },
  });

  const categories = [
    { name: 'Sickles & Harvesting Blades', description: 'Example curved harvesting tools' },
    { name: 'Hoes & Digging Tools', description: 'Example hoe and digging implements' },
    { name: 'Spades & Shovel Heads', description: 'Example spade/shovel heads' },
  ];
  const categoryRows = [];
  for (const c of categories) {
    categoryRows.push(
      await prisma.category.upsert({
        where: { name: c.name },
        create: c,
        update: c,
      }),
    );
  }

  await prisma.businessSetting.upsert({
    where: { key: 'business' },
    create: {
      key: 'business',
      value: {
        businessName: 'Agricultural Tools Co. (Demo)',
        address: 'Example Industrial Area, Maharashtra, India',
        phone: '+91 90000 00000',
        email: 'demo@agricultural-tools.example',
        gstin: 'DEMO-GSTIN-REPLACE',
        invoicePrefix: 'INV',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        lowStockDefault: 10,
        paymentMethods: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'],
        units: ['pcs', 'set', 'kg', 'dozen'],
        allowNegativeStock: false,
        invoiceTerms:
          'Goods once sold are returnable only as per company policy. Tax configuration must be confirmed by your accountant before production use.',
      },
    },
    update: {},
  });
  await prisma.businessSetting.upsert({
    where: { key: 'allowNegativeStock' },
    create: { key: 'allowNegativeStock', value: false },
    update: { value: false },
  });
  await prisma.invoiceSequence.upsert({
    where: { id: 'default' },
    create: { id: 'default', prefix: 'INV', nextNumber: 1 },
    update: {},
  });

  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'), 'products');
  fs.mkdirSync(uploadDir, { recursive: true });
  const seedAssets = path.resolve(__dirname, '../seed-assets');

  const products = [
    {
      sku: 'EX-SICKLE-ORG-01',
      name: 'Example Curved Sickle — Orange Handle',
      categoryId: categoryRows[0].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — name/price placeholder; replace with confirmed product data.',
      unit: 'pcs',
      costPrice: 180,
      sellingPrice: 275,
      reorderLevel: 15,
      image: 'ref-01-sickle-orange.jpg',
    },
    {
      sku: 'EX-SICKLE-GRN-02',
      name: 'Example Curved Sickle — Green Handle',
      categoryId: categoryRows[0].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 185,
      sellingPrice: 285,
      reorderLevel: 12,
      image: 'ref-02-sickle-green.jpg',
    },
    {
      sku: 'EX-SICKLE-RED-03',
      name: 'Example Harvest Blade — Red Handle',
      categoryId: categoryRows[0].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 190,
      sellingPrice: 295,
      reorderLevel: 10,
      image: 'ref-03-sickle-red.jpg',
    },
    {
      sku: 'EX-HOE-04',
      name: 'Example Hoe Blade',
      categoryId: categoryRows[1].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 220,
      sellingPrice: 340,
      reorderLevel: 8,
      image: 'ref-04-hoe-blade.jpg',
    },
    {
      sku: 'EX-SPADE-05',
      name: 'Example Spade Head',
      categoryId: categoryRows[2].id,
      productType: ProductType.RESOLD,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 260,
      sellingPrice: 399,
      reorderLevel: 6,
      image: 'ref-05-spade-head.jpg',
    },
    {
      sku: 'EX-SPADE-06',
      name: 'Example Spade Head — Variant',
      categoryId: categoryRows[2].id,
      productType: ProductType.RESOLD,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 270,
      sellingPrice: 420,
      reorderLevel: 6,
      image: 'ref-06-spade-variant.jpg',
    },
    {
      sku: 'EX-SICKLE-BLU-07',
      name: 'Example Sickle — Blue Handle',
      categoryId: categoryRows[0].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 175,
      sellingPrice: 265,
      reorderLevel: 20,
      image: 'ref-07-sickle-blue.jpg',
    },
    {
      sku: 'EX-HOE-08',
      name: 'Example Digging Hoe Variant',
      categoryId: categoryRows[1].id,
      productType: ProductType.MANUFACTURED,
      description: 'DEMO SAMPLE — visual reference only.',
      unit: 'pcs',
      costPrice: 230,
      sellingPrice: 355,
      reorderLevel: 8,
      image: 'ref-11-hoe-variant.jpg',
    },
  ];

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.local' } });
  const createdProducts = [];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        productType: p.productType,
        description: p.description,
        unit: p.unit,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        taxRateId: gst.id,
        reorderLevel: p.reorderLevel,
        isActive: true,
      },
      update: {
        name: p.name,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        reorderLevel: p.reorderLevel,
        taxRateId: gst.id,
        isActive: true,
      },
    });
    createdProducts.push(product);

    await prisma.stockBalance.upsert({
      where: { productId_locationId: { productId: product.id, locationId: null as unknown as string } },
      create: { productId: product.id, locationId: null, quantityOnHand: 0 },
      update: {},
    }).catch(async () => {
      const existing = await prisma.stockBalance.findFirst({
        where: { productId: product.id, locationId: null },
      });
      if (!existing) {
        await prisma.stockBalance.create({
          data: { productId: product.id, locationId: null, quantityOnHand: 0 },
        });
      }
    });

    const src = path.join(seedAssets, p.image);
    if (fs.existsSync(src)) {
      const destName = `${product.sku.toLowerCase()}.jpg`;
      const dest = path.join(uploadDir, destName);
      fs.copyFileSync(src, dest);
      const existingImg = await prisma.productImage.findFirst({ where: { productId: product.id } });
      if (!existingImg) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            storageKey: `products/${destName}`,
            altText: `${p.name} (reference photo)`,
            sortOrder: 0,
          },
        });
      }
    }

    const opening = await prisma.stockMovement.findFirst({
      where: { productId: product.id, movementType: 'OPENING' },
    });
    if (!opening) {
      const openQty = p.reorderLevel + 25;
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          movementType: 'OPENING',
          quantityDelta: openQty,
          unitCost: p.costPrice,
          referenceType: 'opening',
          reason: 'Demo opening stock',
          createdById: admin.id,
        },
      });
      await prisma.stockBalance.updateMany({
        where: { productId: product.id, locationId: null },
        data: { quantityOnHand: openQty },
      });
    }
  }

  const supplier = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-1' },
    create: {
      id: 'seed-supplier-1',
      name: 'Demo Steel Inputs Pvt Ltd',
      contactName: 'Ravi Kumar',
      phone: '+91 98111 11111',
      email: 'supplier@demo.local',
      address: 'Example Supplier Address',
      taxId: 'DEMO-SUP-GST',
      notes: 'Demo supplier — replace with real data',
    },
    update: {},
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'seed-customer-1' },
    create: {
      id: 'seed-customer-1',
      name: 'Demo Farm Supplies',
      phone: '9876543210',
      email: 'customer@demo.local',
      billingAddress: 'Example Village Road, Nashik',
      businessName: 'Demo Farm Supplies',
      notes: 'Demo customer',
    },
    update: {},
  });

  await prisma.customer.upsert({
    where: { id: 'seed-walkin' },
    create: {
      id: 'seed-walkin',
      name: 'Walk-in Customer',
      isWalkIn: true,
      isActive: true,
    },
    update: {},
  });

  const existingPo = await prisma.purchase.findFirst({ where: { purchaseNumber: 'PO-00001' } });
  if (!existingPo) {
    const p = createdProducts[0];
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber: 'PO-00001',
        supplierId: supplier.id,
        supplierInvoiceNumber: 'SUP-DEMO-100',
        status: 'RECEIVED',
        purchaseDate: new Date(),
        subtotal: 1800,
        discountTotal: 0,
        taxTotal: 324,
        otherCharges: 0,
        grandTotal: 2124,
        amountPaid: 1000,
        balanceDue: 1124,
        receivedAt: new Date(),
        createdById: admin.id,
        items: {
          create: [
            {
              productId: p.id,
              quantityOrdered: 10,
              quantityReceived: 10,
              unitCost: 180,
              discount: 0,
              taxRateSnapshot: 18,
              lineTotal: 2124,
            },
          ],
        },
        payments: {
          create: [
            {
              amount: 1000,
              method: 'BANK_TRANSFER',
              reference: 'DEMO-PAY-1',
              createdById: admin.id,
            },
          ],
        },
      },
    });

    // Ensure stock includes this receipt if opening already set — skip double if movement exists
    const recvMove = await prisma.stockMovement.findFirst({
      where: { referenceType: 'Purchase', referenceId: purchase.id },
    });
    if (!recvMove) {
      await prisma.stockMovement.create({
        data: {
          productId: p.id,
          movementType: 'PURCHASE_RECEIPT',
          quantityDelta: 10,
          unitCost: 180,
          referenceType: 'Purchase',
          referenceId: purchase.id,
          reason: 'Seed receive PO-00001',
          createdById: admin.id,
        },
      });
      const bal = await prisma.stockBalance.findFirst({ where: { productId: p.id } });
      if (bal) {
        await prisma.stockBalance.update({
          where: { id: bal.id },
          data: { quantityOnHand: Number(bal.quantityOnHand) + 10 },
        });
      }
    }
  }

  const existingInv = await prisma.invoice.findFirst({ where: { invoiceNumber: 'INV-00001' } });
  if (!existingInv) {
    const p = createdProducts[1];
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: 'INV-00001',
        customerId: customer.id,
        status: 'PARTIALLY_PAID',
        invoiceDate: new Date(),
        issuedAt: new Date(),
        subtotal: 570,
        discountTotal: 0,
        taxTotal: 102.6,
        grandTotal: 672.6,
        amountPaid: 300,
        balanceDue: 372.6,
        notes: 'Demo invoice — example values only',
        createdById: admin.id,
        items: {
          create: [
            {
              productId: p.id,
              skuSnapshot: p.sku,
              productNameSnapshot: p.name,
              quantity: 2,
              unitPrice: 285,
              unitCostSnapshot: 185,
              discount: 0,
              taxRateSnapshot: 18,
              taxAmount: 102.6,
              lineTotal: 672.6,
            },
          ],
        },
        payments: {
          create: [
            {
              amount: 300,
              method: 'UPI',
              reference: 'DEMO-UPI-1',
              createdById: admin.id,
            },
          ],
        },
      },
    });
    await prisma.stockMovement.create({
      data: {
        productId: p.id,
        movementType: 'SALE',
        quantityDelta: -2,
        unitCost: 185,
        referenceType: 'Invoice',
        referenceId: invoice.id,
        reason: 'Seed sale INV-00001',
        createdById: admin.id,
      },
    });
    const bal = await prisma.stockBalance.findFirst({ where: { productId: p.id } });
    if (bal) {
      await prisma.stockBalance.update({
        where: { id: bal.id },
        data: { quantityOnHand: Number(bal.quantityOnHand) - 2 },
      });
    }
    await prisma.invoiceSequence.update({
      where: { id: 'default' },
      data: { nextNumber: 2 },
    });
  }

  console.log('Seed complete.');
  console.log('Demo logins (development only — change immediately):');
  console.log('  admin@demo.local / ChangeMe123!');
  console.log('  manager@demo.local / ChangeMe123!');
  console.log('  sales@demo.local / ChangeMe123!');
  console.log('  inventory@demo.local / ChangeMe123!');
  console.log('  readonly@demo.local / ChangeMe123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
