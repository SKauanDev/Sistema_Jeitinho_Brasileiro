import { Router } from "express";
import {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { syncCatalogInventory } from "./catalog-inventory.service.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireAdmin);
const numeric = (value: unknown) => Number(value ?? 0);

inventoryRouter.get("/", async (_request, response) => {
  await syncCatalogInventory();
  const [items, categories] = await Promise.all([
    InventoryItem.findAll({
      where: { active: true, removedAt: null },
      order: [["name", "ASC"]],
    }),
    InventoryCategory.findAll({
      where: { active: true },
      order: [["name", "ASC"]],
    }),
  ]);
  const plain = items.map(
    (item) => item.get({ plain: true }) as Record<string, unknown>,
  );
  response.json({
    items,
    categories,
    summary: {
      items: plain.length,
      lowStock: plain.filter(
        (item) =>
          numeric(item.currentStock) > 0 &&
          numeric(item.currentStock) <= numeric(item.minimumStock),
      ).length,
      outOfStock: plain.filter((item) => numeric(item.currentStock) === 0)
        .length,
      totalValue: plain.reduce(
        (sum, item) =>
          sum + numeric(item.currentStock) * numeric(item.unitCost),
        0,
      ),
    },
  });
});
inventoryRouter.get("/movements", async (request, response) => {
  const where = request.query.itemId
    ? { inventoryItemId: String(request.query.itemId) }
    : undefined;
  response.json(
    await InventoryMovement.findAll({
      where,
      include: [
        {
          model: InventoryItem,
          as: "item",
          attributes: ["id", "name", "unit"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 200,
    }),
  );
});
inventoryRouter.post("/categories", async (request, response) => {
  const name = String(request.body.name ?? "").trim();
  if (name.length < 2) {
    response.status(400).json({ message: "Informe o nome da categoria." });
    return;
  }
  try {
    response
      .status(201)
      .json(await InventoryCategory.create({ name, active: true }));
  } catch {
    response.status(409).json({ message: "Essa categoria já existe." });
  }
});
inventoryRouter.post("/items", async (request, response) => {
  const name = String(request.body.name ?? "").trim();
  const currentStock = numeric(request.body.currentStock);
  const minimumStock = numeric(request.body.minimumStock);
  const unitCost = numeric(request.body.unitCost);
  if (
    !name ||
    [currentStock, minimumStock, unitCost].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    response
      .status(400)
      .json({ message: "Preencha os dados do item com valores válidos." });
    return;
  }
  const item = await sequelize.transaction(async (transaction) => {
    const created = await InventoryItem.create(
      {
        name,
        category: String(request.body.category ?? "Insumos"),
        unit: String(request.body.unit ?? "un"),
        currentStock,
        minimumStock,
        unitCost,
      },
      { transaction },
    );
    if (currentStock > 0)
      await InventoryMovement.create(
        {
          inventoryItemId: created.getDataValue("id"),
          type: "ADJUST",
          quantity: currentStock,
          previousStock: 0,
          resultingStock: currentStock,
          reason: "Saldo inicial",
          createdBy: (response.locals.user as { username?: string }).username,
        },
        { transaction },
      );
    return created;
  });
  response.status(201).json(item);
});
inventoryRouter.patch("/items/:id", async (request, response) => {
  const item = await InventoryItem.findByPk(request.params.id);
  if (!item || item.getDataValue("removedAt")) {
    response.status(404).json({ message: "Item não encontrado." });
    return;
  }
  const changes: Record<string, unknown> = {};
  for (const key of [
    "name",
    "category",
    "unit",
    "minimumStock",
    "unitCost",
    "active",
  ])
    if (request.body[key] !== undefined) changes[key] = request.body[key];
  if (
    [changes.minimumStock, changes.unitCost].some(
      (value) =>
        value !== undefined &&
        (!Number.isFinite(Number(value)) || Number(value) < 0),
    )
  ) {
    response.status(400).json({ message: "Valores de estoque inválidos." });
    return;
  }
  await item.update(changes);
  response.json(item);
});
inventoryRouter.delete("/items/:id", async (request, response) => {
  const removed = await sequelize.transaction(async transaction => {
    const item = await InventoryItem.findByPk(String(request.params.id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!item || item.getDataValue("removedAt")) return false;
    await item.update({ active: false, removedAt: new Date() }, { transaction });
    return true;
  });
  if (!removed) {
    response.status(404).json({ message: "Item não encontrado." });
    return;
  }
  response.status(204).send();
});
inventoryRouter.post("/items/:id/movements", async (request, response) => {
  const type = String(request.body.type) as "IN" | "OUT" | "ADJUST";
  const quantity = numeric(request.body.quantity);
  const reason = String(request.body.reason ?? "").trim();
  if (
    !["IN", "OUT", "ADJUST"].includes(type) ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !reason
  ) {
    response
      .status(400)
      .json({ message: "Informe tipo, quantidade e motivo válidos." });
    return;
  }
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const item = await InventoryItem.findByPk(request.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item || !item.getDataValue("active") || item.getDataValue("removedAt"))
        throw new Error("ITEM_NOT_FOUND");
      const previous = numeric(item.getDataValue("currentStock"));
      const resulting =
        type === "IN"
          ? previous + quantity
          : type === "OUT"
            ? previous - quantity
            : quantity;
      if (resulting < 0) throw new Error("INSUFFICIENT_STOCK");
      await item.update({ currentStock: resulting }, { transaction });
      const movement = await InventoryMovement.create(
        {
          inventoryItemId: request.params.id,
          type,
          quantity: type === "ADJUST" ? resulting - previous : quantity,
          previousStock: previous,
          resultingStock: resulting,
          reason,
          notes: request.body.notes,
          createdBy: (response.locals.user as { username?: string }).username,
        },
        { transaction },
      );
      return { item, movement };
    });
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      response.status(404).json({ message: "Item não encontrado." });
      return;
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      response
        .status(409)
        .json({ message: "A saída é maior que o saldo disponível." });
      return;
    }
    throw error;
  }
});
