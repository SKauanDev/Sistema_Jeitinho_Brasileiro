import { DataTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

const id = {
  type: DataTypes.UUID,
  defaultValue: DataTypes.UUIDV4,
  primaryKey: true,
};

export const User = sequelize.define("User", {
  id,
  name: { type: DataTypes.STRING(120), allowNull: false },
  username: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM("ADMIN", "OPERATOR", "KITCHEN"), allowNull: false, defaultValue: "OPERATOR" },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "users" });

export const CustomerAccount = sequelize.define("CustomerAccount", {
  id,
  email: DataTypes.STRING(254),
  emailVerifiedAt: DataTypes.DATE,
  pendingEmail: DataTypes.STRING(254),
  emailCodeHash: DataTypes.STRING(64),
  emailCodePurpose: DataTypes.STRING(20),
  emailCodeExpiresAt: DataTypes.DATE,
  emailCodeSentAt: DataTypes.DATE,
  emailCodeAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  phone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "customer_accounts" });

export const CustomerCoupon = sequelize.define("CustomerCoupon", {
  id,
  customerAccountId: { type: DataTypes.UUID, allowNull: false },
  couponId: { type: DataTypes.UUID, allowNull: false },
  couponCode: { type: DataTypes.STRING(50), allowNull: false },
  redeemedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "customer_coupons", updatedAt: false, indexes: [{ unique: true, fields: ["customer_account_id", "coupon_id"] }] });

export const Category = sequelize.define("Category", {
  id,
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
  imageUrl: DataTypes.STRING(2048),
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "categories" });

export const Product = sequelize.define("Product", {
  id,
  categoryId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  description: DataTypes.TEXT,
  imageUrl: DataTypes.STRING(2048),
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  promotionalPrice: DataTypes.DECIMAL(10, 2),
  featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  pizzaSlots: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  sizes: { type: DataTypes.JSON, allowNull: true },
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  trashedAt: DataTypes.DATE(3),
}, { tableName: "products" });

export const ProductImage = sequelize.define("ProductImage", {
  id,
  categoryId: DataTypes.UUID,
  originalName: { type: DataTypes.STRING(255), allowNull: false },
  mimeType: { type: DataTypes.STRING(50), allowNull: false },
  size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  data: { type: DataTypes.BLOB("long"), allowNull: false },
}, { tableName: "product_images", updatedAt: false });

export const OptionGroup = sequelize.define("OptionGroup", {
  id,
  name: { type: DataTypes.STRING(120), allowNull: false },
  selectionType: { type: DataTypes.ENUM("SINGLE", "MULTIPLE"), allowNull: false, defaultValue: "MULTIPLE" },
  minSelections: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  maxSelections: DataTypes.INTEGER,
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "option_groups" });

export const Option = sequelize.define("Option", {
  id,
  optionGroupId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  priceDelta: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "options" });

export const ProductOptionGroup = sequelize.define("ProductOptionGroup", {
  productId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  optionGroupId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: "product_option_groups", timestamps: false });

export const Order = sequelize.define("Order", {
  id,
  diningSessionId: DataTypes.UUID,
  tableNumber: DataTypes.INTEGER.UNSIGNED,
  customerAccountId: DataTypes.UUID,
  displayNumber: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, autoIncrement: true, unique: true },
  status: {
    type: DataTypes.ENUM("NEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELED"),
    allowNull: false,
    defaultValue: "NEW",
  },
  fulfillmentType: { type: DataTypes.ENUM("PICKUP", "DELIVERY"), allowNull: false },
  customerName: { type: DataTypes.STRING(120), allowNull: false },
  customerPhone: { type: DataTypes.STRING(30), allowNull: false },
  customerEmail: DataTypes.STRING(254),
  customerDocument: DataTypes.STRING(14),
  notes: DataTypes.TEXT,
  street: DataTypes.STRING(180),
  number: DataTypes.STRING(30),
  complement: DataTypes.STRING(120),
  neighborhood: DataTypes.STRING(120),
  city: DataTypes.STRING(120),
  state: DataTypes.STRING(2),
  postalCode: DataTypes.STRING(12),
  addressReference: DataTypes.STRING(255),
  subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  deliveryFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  digitalSecurityFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  paymentMethod: { type: DataTypes.ENUM("PIX", "CASH", "CREDIT_CARD", "DEBIT_CARD", "ONLINE", "RECEIVED_ONLINE"), allowNull: true },
  paymentStatus: { type: DataTypes.ENUM("NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "EXPIRED"), allowNull: false, defaultValue: "NOT_REQUIRED" },
  paymentProvider: DataTypes.STRING(40),
  paymentExternalId: { type: DataTypes.STRING(100), unique: true },
  paymentExpiresAt: DataTypes.DATE(3),
  pixCopyPaste: DataTypes.TEXT,
  pixQrCodeBase64: DataTypes.TEXT("long"),
  paymentCheckoutUrl: DataTypes.TEXT,
  paidAt: DataTypes.DATE(3),
  changeFor: DataTypes.DECIMAL(10, 2),
  couponCode: DataTypes.STRING(50),
  discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  completedAt: DataTypes.DATE(3),
  cancellationReason: DataTypes.STRING(255),
  inventoryProcessedAt: DataTypes.DATE(3),
  inventoryRevertedAt: DataTypes.DATE(3),
}, { tableName: "orders" });

export const OrderItem = sequelize.define("OrderItem", {
  id,
  orderId: { type: DataTypes.UUID, allowNull: false },
  productId: DataTypes.UUID,
  productName: { type: DataTypes.STRING(160), allowNull: false },
  quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  optionsTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  lineTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  notes: DataTypes.TEXT,
}, { tableName: "order_items", updatedAt: false });

export const OrderItemOption = sequelize.define("OrderItemOption", {
  id,
  orderItemId: { type: DataTypes.UUID, allowNull: false },
  optionId: DataTypes.UUID,
  optionName: { type: DataTypes.STRING(120), allowNull: false },
  optionGroupName: { type: DataTypes.STRING(120), allowNull: false },
  priceDelta: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
}, { tableName: "order_item_options", timestamps: false });

export const OrderStatusHistory = sequelize.define("OrderStatusHistory", {
  id,
  orderId: { type: DataTypes.UUID, allowNull: false },
  status: {
    type: DataTypes.ENUM("NEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELED"),
    allowNull: false,
  },
}, { tableName: "order_status_history", updatedAt: false });

export const StoreSetting = sequelize.define("StoreSetting", {
  id,
  pizzaRules: DataTypes.JSON,
  tableCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 40 },
  storeName: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "Pizzaria Jeitinho Brasileiro" },
  isOpen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  averagePreparationMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 30 },
  phone: DataTypes.STRING(30), whatsapp: DataTypes.STRING(30), address: DataTypes.STRING(255), logoUrl: DataTypes.STRING(2048), coverUrl: DataTypes.STRING(2048),
  postalCode: DataTypes.STRING(10), street: DataTypes.STRING(180), number: DataTypes.STRING(20), neighborhood: DataTypes.STRING(120), city: DataTypes.STRING(120), state: DataTypes.STRING(2), complement: DataTypes.STRING(120),
  autoAcceptOrders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, minimumOrder: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 }, allowPickup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, allowDelivery: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, fixedDeliveryFee: { type: DataTypes.DECIMAL(10,2), allowNull: true, defaultValue: null },
  pixEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, cashEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, cardOnDeliveryEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, onlinePaymentEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, pixKey: DataTypes.STRING(255),
}, { tableName: "store_settings" });
export const StoreHour = sequelize.define("StoreHour", { id, storeSettingId:{type:DataTypes.UUID,allowNull:false}, dayOfWeek:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false}, isClosed:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false}, opensAt:DataTypes.TIME, closesAt:DataTypes.TIME },{tableName:"store_hours"});
export const DiningTable = sequelize.define("DiningTable", {
  id,
  number: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
  accessKey: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  sessionId: DataTypes.UUID,
}, { tableName: "dining_tables" });
export const DiningSession = sequelize.define("DiningSession", {
  id,
  tableId: { type: DataTypes.UUID, allowNull: false },
  closedAt: DataTypes.DATE,
  notes: DataTypes.STRING(500),
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paymentMethod: DataTypes.STRING(40),
}, { tableName: "dining_sessions" });
export const DeliveryZone = sequelize.define("DeliveryZone", { id, name:{type:DataTypes.STRING(120),allowNull:false}, fee:{type:DataTypes.DECIMAL(10,2),allowNull:false,defaultValue:0}, estimatedMinutesMin:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,defaultValue:30}, estimatedMinutesMax:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,defaultValue:45}, minimumOrder:{type:DataTypes.DECIMAL(10,2),allowNull:false,defaultValue:0}, active:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true} },{tableName:"delivery_zones"});

export const InventoryItem = sequelize.define("InventoryItem", {
  id,
  removedAt: DataTypes.DATE(3),
  productId: { type: DataTypes.UUID, unique: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  category: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "Insumos" },
  unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "un" },
  currentStock: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  minimumStock: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "inventory_items" });

export const InventoryCategory = sequelize.define("InventoryCategory", {
  id,
  name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "inventory_categories" });

export const InventoryMovement = sequelize.define("InventoryMovement", {
  id,
  inventoryItemId: { type: DataTypes.UUID, allowNull: false },
  orderId: DataTypes.UUID,
  sourceId: { type: DataTypes.STRING(120), unique: true },
  type: { type: DataTypes.ENUM("IN", "OUT", "ADJUST"), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  previousStock: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  resultingStock: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  reason: { type: DataTypes.STRING(160), allowNull: false },
  notes: DataTypes.STRING(500),
  createdBy: DataTypes.STRING(120),
}, { tableName: "inventory_movements", updatedAt: false });

export const FinancialEntry = sequelize.define("FinancialEntry", {
  id,
  type: { type: DataTypes.ENUM("IN", "OUT"), allowNull: false },
  category: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  entryDate: { type: DataTypes.DATEONLY, allowNull: false },
  notes: DataTypes.STRING(500),
  createdBy: DataTypes.STRING(120),
  sourceId: { type: DataTypes.STRING(100), unique: true },
}, { tableName: "financial_entries" });

export const Coupon = sequelize.define("Coupon", {
  id,
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: DataTypes.STRING(255),
  discountType: { type: DataTypes.ENUM("PERCENTAGE", "FIXED"), allowNull: false },
  discountValue: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  minimumOrder: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  maximumDiscount: DataTypes.DECIMAL(10, 2),
  startsAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usageLimit: DataTypes.INTEGER.UNSIGNED,
  usageCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: "coupons" });

Category.hasMany(Product, { foreignKey: "categoryId", as: "products" });
Product.belongsTo(Category, { foreignKey: "categoryId", as: "category" });
OptionGroup.hasMany(Option, { foreignKey: "optionGroupId", as: "options" });
Option.belongsTo(OptionGroup, { foreignKey: "optionGroupId", as: "group" });
Product.belongsToMany(OptionGroup, { through: ProductOptionGroup, foreignKey: "productId", otherKey: "optionGroupId", as: "optionGroups" });
OptionGroup.belongsToMany(Product, { through: ProductOptionGroup, foreignKey: "optionGroupId", otherKey: "productId", as: "products" });
Order.hasMany(OrderItem, { foreignKey: "orderId", as: "items" });
OrderItem.belongsTo(Order, { foreignKey: "orderId", as: "order" });
Product.hasMany(OrderItem, { foreignKey: "productId", as: "orderItems" });
OrderItem.belongsTo(Product, { foreignKey: "productId", as: "product" });
OrderItem.hasMany(OrderItemOption, { foreignKey: "orderItemId", as: "selectedOptions" });
OrderItemOption.belongsTo(OrderItem, { foreignKey: "orderItemId", as: "item" });
Option.hasMany(OrderItemOption, { foreignKey: "optionId", as: "orderItems" });
OrderItemOption.belongsTo(Option, { foreignKey: "optionId", as: "option" });
Order.hasMany(OrderStatusHistory, { foreignKey: "orderId", as: "statusHistory" });
OrderStatusHistory.belongsTo(Order, { foreignKey: "orderId", as: "order" });
InventoryItem.hasMany(InventoryMovement, { foreignKey: "inventoryItemId", as: "movements" });
InventoryMovement.belongsTo(InventoryItem, { foreignKey: "inventoryItemId", as: "item" });
Product.hasOne(InventoryItem, { foreignKey: "productId", as: "inventoryItem" });
InventoryItem.belongsTo(Product, { foreignKey: "productId", as: "product" });
Order.hasMany(InventoryMovement, { foreignKey: "orderId", as: "inventoryMovements" });
InventoryMovement.belongsTo(Order, { foreignKey: "orderId", as: "order" });
StoreSetting.hasMany(StoreHour,{foreignKey:"storeSettingId",as:"hours"}); StoreHour.belongsTo(StoreSetting,{foreignKey:"storeSettingId",as:"store"});
CustomerAccount.hasMany(CustomerCoupon, { foreignKey: "customerAccountId", as: "coupons" });
CustomerCoupon.belongsTo(CustomerAccount, { foreignKey: "customerAccountId", as: "customer" });
Coupon.hasMany(CustomerCoupon, { foreignKey: "couponId", as: "customerRedemptions" });
CustomerCoupon.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon" });

export const models = {
  User, CustomerAccount, CustomerCoupon, Category, Product, ProductImage, OptionGroup, Option, ProductOptionGroup,
  Order, OrderItem, OrderItemOption, OrderStatusHistory, StoreSetting, StoreHour, DiningTable, DiningSession, DeliveryZone, InventoryCategory, InventoryItem, InventoryMovement, FinancialEntry, Coupon,
};
