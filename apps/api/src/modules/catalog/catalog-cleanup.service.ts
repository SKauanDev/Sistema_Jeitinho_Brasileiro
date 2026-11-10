import { Op } from "sequelize";
import { OrderItem, Product, ProductImage, ProductOptionGroup } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";

const databaseImageId = (value: unknown) => /^\/catalog\/images\/([0-9a-f-]{36})$/i.exec(String(value ?? ""))?.[1];

export async function purgeExpiredCatalogTrash() {
  const limit = new Date(Date.now() - 15 * 86400000);
  const products = await Product.findAll({ where: { trashedAt: { [Op.lte]: limit } } });
  for (const product of products) await sequelize.transaction(async transaction => {
    const imageId = databaseImageId(product.getDataValue("imageUrl"));
    const productId = String(product.getDataValue("id"));
    await OrderItem.update({ productId: null }, { where: { productId }, transaction });
    await ProductOptionGroup.destroy({ where: { productId }, transaction });
    await product.destroy({ transaction });
    if (imageId) await ProductImage.destroy({ where: { id: imageId }, transaction });
  });
  return products.length;
}
