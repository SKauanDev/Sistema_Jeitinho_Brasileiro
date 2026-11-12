import { sequelize } from "./sequelize.js";
import { getStoreSetting } from "../modules/settings/store-operation.service.js";
import { readPizzaRules } from "../modules/catalog/pizza-rules.js";
import { initialStyleMenus } from "../modules/catalog/pizza-style-menu.js";

try {
  const setting = await getStoreSetting();
  const rules = readPizzaRules(setting.getDataValue("pizzaRules"));
  if (rules.menus?.length) console.log("Tabela por estilo já configurada; valores existentes preservados.");
  else {
    await setting.update({ pizzaRules: { ...rules, menus: initialStyleMenus(rules.borders) } });
    console.log("Tabela informada cadastrada por categoria, estilo e tamanho. Borda premium e preços mistos pendentes no admin. Recheios existentes preservados.");
  }
} finally { await sequelize.close(); }
