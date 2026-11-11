import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Op } from "sequelize";
import { Category, Product, OptionGroup, Option, ProductOptionGroup, StoreSetting } from "./models.js";
import { sequelize } from "./sequelize.js";

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const asianCategory = /joy|harumaki|hossomaki|temaki|sashimi|hot.?roll|sushi|niguiri|uramaki|yakisoba|poke/;
const asianProduct = /sushi|temaki|sashimi|hot.?roll|salm[aã]o|nori|\bpecas\b|saque|sake/;
const categories = ["Pizzas", "Combos", "Pizzas doces"];
const menu = [
  { category: "Pizzas", name: "4 Queijos", description: "Molho de tomate, mussarela, parmesão, provolone e gorgonzola. Pizza grande de 8 fatias, inteira ou meio a meio.", price: 39.9, image: 0, pizzaSlots: 1 },
  { category: "Pizzas", name: "Bacon Supreme", description: "Molho de tomate, mussarela, bacon crocante, cebola e orégano. Pizza grande de 8 fatias, inteira ou meio a meio.", price: 39.9, image: 1, pizzaSlots: 1 },
  { category: "Pizzas", name: "Calabresa", description: "Molho de tomate, mussarela, calabresa fatiada, cebola e orégano. Pizza grande de 8 fatias, inteira ou meio a meio.", price: 39.9, image: 2, pizzaSlots: 1 },
  { category: "Pizzas", name: "Camarão", description: "Molho de tomate, mussarela, camarão e orégano. Pizza grande de 8 fatias, inteira ou meio a meio.", price: 39.9, image: 3, pizzaSlots: 1 },
  { category: "Pizzas", name: "Portuguesa", description: "Mussarela, presunto, ovo, cebola, pimentão e azeitonas. Pizza grande de 8 fatias, inteira ou meio a meio.", price: 39.9, image: 4, pizzaSlots: 1 },
  { category: "Pizzas doces", name: "Chocolate com Morango", description: "Pizza doce com chocolate cremoso e morangos. Massa leve e borda douradinha, 8 fatias.", price: 39.9, image: 5, pizzaSlots: 0 },
  { category: "Combos", name: "Combo Individual", description: "1 pizza grande de até dois sabores + Coca-Cola 600 ml.", price: 49.9, pizzaSlots: 1 },
  { category: "Combos", name: "Combo Casal", description: "1 pizza grande de até dois sabores + refrigerante de 2 litros.", price: 59.9, pizzaSlots: 1 },
  { category: "Combos", name: "Combo Família", description: "2 pizzas grandes, cada uma com até dois sabores + refrigerante de 2 litros.", price: 99.9, pizzaSlots: 2 },
  { category: "Combos", name: "Combo Festa", description: "3 pizzas grandes, cada uma com até dois sabores + 2 refrigerantes de 2 litros.", price: 149.9, pizzaSlots: 3 },
];

try {
  await sequelize.authenticate();
  const oldCategories = await Category.findAll();
  const oldProducts = await Product.findAll();
  const groups = await OptionGroup.findAll();
  const options = await Option.findAll();
  const links = await ProductOptionGroup.findAll();
  // Catalog-only backup: no credentials, customer information or payment data.
  const backup = path.resolve("backup_database", `catalog-before-pizzeria-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, JSON.stringify({ categories: oldCategories.map(row => row.toJSON()), products: oldProducts.map(row => row.toJSON()), optionGroups: groups.map(row => row.toJSON()), options: options.map(row => row.toJSON()), productOptionGroups: links.map(row => row.toJSON()) }, null, 2));

  const result = await sequelize.transaction(async transaction => {
    const oldAsianIds = oldCategories.filter(row => asianCategory.test(normalize(row.getDataValue("name")))).map(row => String(row.getDataValue("id")));
    const oldProductIds = oldProducts.filter(row => oldAsianIds.includes(String(row.getDataValue("categoryId"))) || asianProduct.test(normalize(`${row.getDataValue("name")} ${row.getDataValue("description")}`))).map(row => String(row.getDataValue("id")));
    if (oldAsianIds.length) await Category.update({ active: false }, { where: { id: { [Op.in]: oldAsianIds } }, transaction });
    if (oldProductIds.length) await Product.update({ active: false }, { where: { id: { [Op.in]: oldProductIds } }, transaction });
    const categoryIds = new Map<string, string>();
    for (const [position, name] of categories.entries()) {
      const slug = normalize(name).replace(/[^a-z0-9]+/g, "-");
      const [category] = await Category.findOrCreate({ where: { slug }, defaults: { name, position, active: true }, transaction });
      await category.update({ name, position, active: true }, { transaction });
      categoryIds.set(name, String(category.getDataValue("id")));
    }
    await Category.update({ position: 3 }, { where: { slug: "bebidas" }, transaction });
    for (const [position, item] of menu.entries()) {
      const categoryId = categoryIds.get(item.category)!;
      const imageUrl = "image" in item ? `/images/pizza-menu.png#pizza=${item.image}` : "/images/logo.png";
      const values = { categoryId, name: item.name, description: item.description, price: item.price, promotionalPrice: null, imageUrl, pizzaSlots: item.pizzaSlots, position, featured: item.category === "Pizzas" || item.name === "Combo Família", active: true, trashedAt: null };
      const [product, created] = await Product.findOrCreate({ where: { categoryId, name: item.name }, defaults: values, transaction });
      if (!created) await product.update(values, { transaction });
    }
    await StoreSetting.update({ storeName: "Pizzaria Jeitinho Brasileiro", logoUrl: "/images/logo.png", coverUrl: "/images/logo.png" }, { where: {}, transaction });
    return { deactivatedCategories: oldAsianIds.length, deactivatedProducts: oldProductIds.length, registeredProducts: menu.length };
  });
  console.log(JSON.stringify({ backup, ...result }));
} finally {
  await sequelize.close();
}
