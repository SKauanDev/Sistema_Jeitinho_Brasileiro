import { Category, Product } from "./models.js";
import { sequelize } from "./sequelize.js";

const seed = [
  ["Pizzas", "4 Queijos", 29.9, "/images/pizzas/4_queijos.jpg", "Pizza com molho de tomate, mussarela, parmesão, provolone e gorgonzola."],
  ["Pizzas", "Bacon Supreme", 39.9, "/images/pizzas/bacon.jpg", "Pizza com molho de tomate, mussarela, bacon, azeitona, calabresa, cebola caramelizada e orégano."],
  ["Pizzas", "Calabresa", 39.9, "/images/pizzas/calabresa.jpg", "Pizza com molho de tomate, mussarela, calabresa, cebola e orégano."],
  ["Pizzas", "Camarão", 39.9, "/images/pizzas/camarao.jpg", "Pizza com molho de tomate, mussarela, camarão, azeitona, tomate desidratado e orégano."],
  ["Pizzas", "Portuguesa", 39.9, "/images/pizzas/portuguesa.jpg", "Pizza com molho de tomate, mussarela, presunto, ovo, cebola, azeitona, tomate, pimentão e orégano."],
  ["Combos", "Combo Casal", 81.99, "/images/combos/combo_casal.jpeg", "Pizza grande salgada + pequena doce + refrigerante 1 litro.", 1],
  ["Combos", "Combo Família", 99.98, "/images/combos/combo_familia.jpeg", "2 pizzas grandes + refrigerante 1 litro grátis.", 2],
  ["Combos", "Combo Família Prime", 139.98, "/images/combos/combo_familia_prime.jpeg", "2 pizzas salgadas grandes + pizza doce grande + refrigerante 2 litros.", 2],
  ["Combos", "Combo Refri", 57.98, "/images/combos/combo_pizza&refri1l.jpeg", "Pizza grande + refrigerante 1 litro.", 1],
  ["Porções", "Fritas", 18.9, "/images/porcoes/batata.webp", "Batatas sequinhas com páprica, lemon pepper e catupiry."],
  ["Porções", "Filé Acebolado", 18.9, "/images/porcoes/filezinho.webp", "Filé mignon com cebola."],
  ["Porções", "Pastelzinho", 18.9, "/images/porcoes/pastel.jpg", "Pastel de carne, queijo ou frango."],
  ["Bebidas", "H2Oh", 9.9, "/images/bebidas/h2o.jpg", "Refrigerante H2Oh 500ml."],
  ["Bebidas", "Refrigerante 2 Litros", 9.9, "/images/bebidas/refrigerante_2l.webp", "Refrigerante 2 litros."],
  ["Bebidas", "Água Mineral com Gás", 9.9, "/images/bebidas/agua_com_gas.jpg", "Água mineral com gás 500ml."],
  ["Bebidas", "Água Mineral sem Gás", 9.9, "/images/bebidas/agua_sem_gas.webp", "Água mineral sem gás 500ml."],
  ["Vinhos", "Vinho Chileno - Alto", 9.9, "/images/vinhos/vinho_chileno_alto.webp", "Vinho tinto seco 750ml."],
  ["Vinhos", "Vinho Chileno - Pailino", 9.9, "/images/vinhos/vinho_chileno_pailino.webp", "Vinho tinto suave 750ml."],
  ["Vinhos", "Vinho Chileno - Salta Vita", 9.9, "/images/vinhos/vinho_chileno_salta_vita.webp", "Vinho tinto suave 750ml."],
  ["Sobremesas", "Pudim de Leite", 12.9, "/images/sobremesas/pudinzinho.jpg", "Pudim de leite condensado."],
  ["Sobremesas", "Sorvetes", 12.9, "/images/sobremesas/sorvete.webp", "Sorvete de creme, chocolate e morango."],
  ["Sobremesas", "Bolo de Pote", 12.9, "/images/sobremesas/bolo_no_pote.jpeg", "Bolo de pote com cobertura de chocolate."],
] as const;
const categoryNames = [...new Set(seed.map((item) => item[0]))];
await sequelize.authenticate();
for (const [position, name] of categoryNames.entries()) await Category.findOrCreate({ where: { slug: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") }, defaults: { name, position, active: true } });
const categories = await Category.findAll(); const categoryMap = new Map(categories.map((item) => [item.getDataValue("name"), item.getDataValue("id")]));
for (const [position, item] of seed.entries()) { const [category, name, price, imageUrl, description, pizzaSlots = 0] = item; await Product.findOrCreate({ where: { categoryId: categoryMap.get(category), name }, defaults: { categoryId: categoryMap.get(category), name, price, imageUrl, description, pizzaSlots, featured: category === "Pizzas", active: true, position } }); }
console.log(`Catálogo preparado: ${categoryNames.length} categorias e ${seed.length} produtos.`);
await sequelize.close();
