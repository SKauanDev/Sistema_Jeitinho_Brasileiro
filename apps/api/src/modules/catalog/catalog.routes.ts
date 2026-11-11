import { parseSizes } from "./pizza-sizes.js";
import { Op } from "sequelize";
import { Router } from "express";
import {
  Category,
  Option,
  OptionGroup,
  OrderItem,
  Product,
  ProductImage,
  ProductOptionGroup,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { syncCatalogInventory } from "../inventory/catalog-inventory.service.js";
import { createAsyncCache } from "../../shared/async-cache.js";

export const catalogRouter = Router();
const adminCatalogRouter = Router();
adminCatalogRouter.use(requireAuth, requireAdmin);
adminCatalogRouter.use((request, response, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    response.on("finish", () => {
      if (response.statusCode < 400) publicCatalog.invalidate();
    });
  }
  next();
});

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const databaseImageId = (value: unknown) =>
  /^\/catalog\/images\/([0-9a-f-]{36})$/i.exec(String(value ?? ""))?.[1];
const productInclude = [
  { model: Category, as: "category" },
  {
    model: OptionGroup,
    as: "optionGroups",
    through: { attributes: [] },
    include: [{ model: Option, as: "options" }],
  },
];

const publicCatalog = createAsyncCache(30_000, async () => {
  const categories = await Category.findAll({
    where: { active: true },
    include: [
      {
        model: Product,
        as: "products",
        where: { active: true, trashedAt: null },
        required: false,
        include: productInclude.slice(1),
      },
    ],
    order: [
      ["position", "ASC"],
      ["name", "ASC"],
      [{ model: Product, as: "products" }, "position", "ASC"],
    ],
  });
  return JSON.stringify(categories);
});

catalogRouter.get("/", async (_request, response) => {
  // Server-side cache only: no stale CDN copy after an administrator edits a product.
  response.setHeader("Cache-Control", "no-cache");
  response.type("json").send(await publicCatalog.get());
});

catalogRouter.get("/images/:id", async (request, response) => {
  const image = await ProductImage.findByPk(request.params.id);
  if (!image) {
    response.status(404).json({ message: "Imagem não encontrada." });
    return;
  }
  response.setHeader("Content-Type", String(image.getDataValue("mimeType")));
  response.setHeader("Content-Length", String(image.getDataValue("size")));
  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  response.send(image.getDataValue("data"));
});

adminCatalogRouter.get("/", async (_request, response) => {
  const categories = await Category.findAll({
    include: [
      {
        model: Product,
        as: "products",
        where: { trashedAt: null },
        required: false,
        include: productInclude.slice(1),
      },
    ],
    order: [
      ["position", "ASC"],
      ["name", "ASC"],
      [{ model: Product, as: "products" }, "position", "ASC"],
    ],
  });
  const trashed = (await Product.findAll({
    attributes: ["categoryId"],
    where: { trashedAt: { [Op.ne]: null } },
    raw: true,
  })) as unknown as Array<{ categoryId: string }>;
  const trashCount = trashed.reduce<Record<string, number>>(
    (counts, product) => {
      const categoryId = String(product.categoryId);
      counts[categoryId] = (counts[categoryId] ?? 0) + 1;
      return counts;
    },
    {},
  );
  response.json(
    categories.map((category) => {
      const plain = category.get({ plain: true }) as Record<string, unknown>;
      return {
        ...plain,
        trashedProductCount: trashCount[String(plain.id)] ?? 0,
      };
    }),
  );
});

adminCatalogRouter.get("/trash", async (_request, response) => {
  const products = await Product.findAll({
    where: { trashedAt: { [Op.ne]: null } },
    include: [{ model: Category, as: "category", attributes: ["name"] }],
    order: [["trashedAt", "DESC"]],
  });
  response.json(
    products.map((product) => {
      const plain = product.get({ plain: true }) as Record<string, any>;
      return {
        ...plain,
        categoryName: plain.category?.name ?? "Sem categoria",
        purgeAt: new Date(new Date(plain.trashedAt).getTime() + 15 * 86400000),
      };
    }),
  );
});

adminCatalogRouter.post("/products/bulk-trash", async (request, response) => {
  const ids = Array.isArray(request.body.ids)
    ? [...new Set(request.body.ids.map(String))].slice(0, 200)
    : [];
  if (!ids.length) {
    response.status(400).json({ message: "Selecione pelo menos um produto." });
    return;
  }
  const [count] = await Product.update(
    { active: false, trashedAt: new Date() },
    { where: { id: { [Op.in]: ids }, trashedAt: null } },
  );
  await syncCatalogInventory();
  response.json({ count });
});

adminCatalogRouter.post("/products/bulk-restore", async (request, response) => {
  const ids = Array.isArray(request.body.ids)
    ? [...new Set(request.body.ids.map(String))].slice(0, 200)
    : [];
  if (!ids.length) {
    response.status(400).json({ message: "Selecione pelo menos um produto." });
    return;
  }
  const [count] = await Product.update(
    { active: true, trashedAt: null },
    { where: { id: { [Op.in]: ids }, trashedAt: { [Op.ne]: null } } },
  );
  await syncCatalogInventory();
  response.json({ count });
});

adminCatalogRouter.post("/upload", async (request, response) => {
  const mimeType = String(request.body.mimeType ?? "");
  const encoded = String(request.body.data ?? "");
  const categoryId = String(request.body.categoryId ?? "");
  const originalName = String(request.body.originalName ?? "produto").slice(
    0,
    255,
  );
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[mimeType];
  if (!extension || !encoded) {
    response
      .status(400)
      .json({ message: "Envie uma imagem JPEG, PNG ou WebP." });
    return;
  }
  const data = encoded.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    response
      .status(413)
      .json({ message: "A imagem deve possuir no máximo 5 MB." });
    return;
  }
  const signatures = {
    jpg: buffer[0] === 0xff && buffer[1] === 0xd8,
    png: buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    webp: buffer.subarray(8, 12).toString() === "WEBP",
  };
  if (!signatures[extension as keyof typeof signatures]) {
    response
      .status(400)
      .json({
        message: "O conteúdo do arquivo não corresponde ao formato informado.",
      });
    return;
  }
  if (categoryId && !(await Category.count({ where: { id: categoryId } }))) {
    response.status(404).json({ message: "Categoria não encontrada." });
    return;
  }
  const image = await ProductImage.create({
    categoryId: categoryId || null,
    originalName,
    mimeType,
    size: buffer.length,
    data: buffer,
  });
  response
    .status(201)
    .json({ imageUrl: `/catalog/images/${image.getDataValue("id")}` });
});

adminCatalogRouter.post("/categories", async (request, response) => {
  const name = String(request.body.name ?? "").trim();
  if (!name) {
    response.status(400).json({ message: "Informe o nome da categoria." });
    return;
  }
  const existing = await Category.count({
    where: { slug: { [Op.like]: `${slugify(name)}%` } },
  });
  const category = await Category.create({
    name,
    slug: `${slugify(name)}${existing ? `-${existing + 1}` : ""}`,
    position: Number(request.body.position ?? 0),
    active: request.body.active !== false,
  });
  response.status(201).json(category);
});
adminCatalogRouter.patch("/categories/:id", async (request, response) => {
  const category = await Category.findByPk(request.params.id);
  if (!category) {
    response.status(404).json({ message: "Categoria não encontrada." });
    return;
  }
  const changes: Record<string, unknown> = {};
  for (const key of ["name", "position", "active"])
    if (request.body[key] !== undefined) changes[key] = request.body[key];
  await category.update(changes);
  response.json(category);
});
adminCatalogRouter.delete("/categories/:id", async (request, response) => {
  const category = await Category.findByPk(request.params.id);
  if (!category) {
    response.status(404).json({ message: "Categoria não encontrada." });
    return;
  }
  if (
    await Product.count({
      where: { categoryId: request.params.id, trashedAt: null },
    })
  ) {
    response
      .status(409)
      .json({
        message:
          "Mova os produtos ativos desta categoria para a lixeira antes de excluí-la.",
      });
    return;
  }
  const trashedProducts = await Product.findAll({
    where: { categoryId: request.params.id, trashedAt: { [Op.ne]: null } },
  });
  await sequelize.transaction(async (transaction) => {
    for (const product of trashedProducts) {
      const productId = String(product.getDataValue("id"));
      const imageId = databaseImageId(product.getDataValue("imageUrl"));
      await OrderItem.update(
        { productId: null },
        { where: { productId }, transaction },
      );
      await ProductOptionGroup.destroy({ where: { productId }, transaction });
      await product.destroy({ transaction });
      if (imageId)
        await ProductImage.destroy({ where: { id: imageId }, transaction });
    }
    await category.destroy({ transaction });
  });
  response.status(204).send();
});

adminCatalogRouter.post("/products", async (request, response) => {
  const name = String(request.body.name ?? "").trim();
  const categoryId = String(request.body.categoryId ?? "");
  const price = Number(request.body.price);
  if (!name || !categoryId || !Number.isFinite(price) || price < 0) {
    response
      .status(400)
      .json({ message: "Nome, categoria e preço válido são obrigatórios." });
    return;
  }
  let sizes;
  try { sizes = parseSizes(request.body.sizes); } catch (error) { response.status(400).json({ message: (error as Error).message }); return; }
  const product = await Product.create({
    sizes,
    name,
    categoryId,
    description: request.body.description,
    imageUrl: request.body.imageUrl,
    price: sizes.length ? Math.min(...sizes.map(entry => entry.price)) : price,
    promotionalPrice: sizes.length ? null : request.body.promotionalPrice || null,
    featured: Boolean(request.body.featured),
    pizzaSlots: Math.max(0, Number(request.body.pizzaSlots ?? 0)),
    active: request.body.active !== false,
    position: Number(request.body.position ?? 0),
  });
  await syncCatalogInventory();
  response.status(201).json(product);
});
adminCatalogRouter.patch("/products/:id", async (request, response) => {
  const product = await Product.findByPk(request.params.id);
  if (!product) {
    response.status(404).json({ message: "Produto não encontrado." });
    return;
  }
  const changes: Record<string, unknown> = {};
  if (request.body.sizes !== undefined) {
    try { changes.sizes = parseSizes(request.body.sizes); } catch (error) { response.status(400).json({ message: (error as Error).message }); return; }
  }

  for (const key of [
    "name",
    "categoryId",
    "description",
    "imageUrl",
    "price",
    "promotionalPrice",
    "featured",
    "pizzaSlots",
    "active",
    "position",
  ])
    if (request.body[key] !== undefined)
      changes[key] =
        request.body[key] === "" && key === "promotionalPrice"
          ? null
          : request.body[key];
  if (Array.isArray(changes.sizes) && changes.sizes.length) { changes.price = Math.min(...changes.sizes.map(entry => entry.price)); changes.promotionalPrice = null; }
  await product.update(changes);
  await syncCatalogInventory();
  response.json(product);
});
adminCatalogRouter.delete("/products/:id", async (request, response) => {
  const product = await Product.findByPk(request.params.id);
  if (!product) {
    response.status(404).json({ message: "Produto não encontrado." });
    return;
  }
  await product.update({ active: false, trashedAt: new Date() });
  await syncCatalogInventory();
  response.status(204).send();
});

export { adminCatalogRouter };
