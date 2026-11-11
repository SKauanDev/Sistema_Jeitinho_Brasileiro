import type { SizePrice } from "../types/catalog";
export type Extra = {
  id: string;
  name: string;
  price: number;
};

export type Product = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  image: string;
  popular?: boolean;
  extras?: Extra[];
  pizzaSlots?: number;
  sizes?: SizePrice[];
};

export const categories = [
 
  "Pizzas",
  "Combos",
  "Porções",
  "Bebidas",
  "Vinhos",
  "Sobremesas",
];

export const products: Product[] = [

  //====================================== PIZZA ======================================
  {
    id: "1",
    category: "Pizzas",
    name: "4 Queijos",
    price: 29.9,
    popular: true,
    description: "Pizza com molho de tomate, mussarela, parmesão, provolone e gorgonzola.",
    image: "/images/pizzas/4_queijos.jpg",
    extras: [
      { id: "e1", name: "Bacon extra", price: 5 },
      { id: "e2", name: "Cheddar extra", price: 4 },
      { id: "e3", name: "Molho especial", price: 2.5 },
    ],
  },
  {
    id: "2",
    category: "Pizzas",
    name: "Bacon Supreme",
    price: 39.9,
    popular: true,
    description: "Pizza com molho de tomate, mussarela, bacon, azeitona, calabresa, cebola caramelizada e orégano.",
    image: "/images/pizzas/bacon.jpg",
    extras: [
      { id: "e4", name: "Fritas grande", price: 5 },
      { id: "e5", name: "Trocar por milk-shake", price: 9 },
    ],
  },
  {
    id: "3",
    category: "Pizzas",
    name: "Calabresa",
    price: 39.9,
    popular: true,
    description: "Pizza com molho de tomate, mussarela, calabresa, cebola e orégano.",
    image: "/images/pizzas/calabresa.jpg",
    extras: [
      { id: "e4", name: "Fritas grande", price: 5 },
      { id: "e5", name: "Trocar por milk-shake", price: 9 },
    ],
  },
  {
    id: "4",
    category: "Pizzas",
    name: "Camarão",
    price: 39.9,
    popular: true,
    description: "Pizza com molho de tomate, mussarela, camarão, azeitona, tomate desidratado e orégano.",
    image: "/images/pizzas/camarao.jpg",
    extras: [
      { id: "e4", name: "Fritas grande", price: 5 },
      { id: "e5", name: "Trocar por milk-shake", price: 9 },
    ],
  },
  {
    id: "5",
    category: "Pizzas",
    name: "Portuguesa",
    price: 39.9,
    popular: true,
    description: "Pizza com molho de tomate, mussarela, presunto, ovo, cebola, azeitona, tomate, pimentão e orégano.",
    image: "/images/pizzas/portuguesa.jpg",
    extras: [
      { id: "e4", name: "Fritas grande", price: 5 },
      { id: "e5", name: "Trocar por milk-shake", price: 9 },
    ],
  },
  //====================================================================================

  //====================================== COMBOS ======================================
  {
    id: "6",
    category: "Combos",
    name: "Combo Casal",
    price: 81.99,
    description: "Pizza Grande Salgada + Pequena Doce + Refri 1 Litro.",
    image: "/images/combos/combo_casal.jpeg",
    pizzaSlots: 1,
  },
  {
    id: "7",
    category: "Combos",
    name: "Combo Família",
    price: 99.98,
    description: "2 Pizzas Grandes + Refri 1 Litro Grátis.",
    image: "/images/combos/combo_familia.jpeg",
    pizzaSlots: 2,
  },
  {
    id: "8",
    category: "Combos",
    name: "Combo Família Prime",
    price: 139.98,
    description: " Pizzas Salgadas Grandes + 1 Pizza Doce Grande + Refri 2 Litros Grátis.",
    image: "/images/combos/combo_familia_prime.jpeg",
    pizzaSlots: 2,
  },
  {
    id: "9",
    category: "Combos",
    name: "Combo Refri",
    price: 57.98,
    description: " Pizza Grande + Refri 1 Litro.",
    image: "/images/combos/combo_pizza&refri1l.jpeg",
    pizzaSlots: 1,
  },
  //====================================================================================

  //====================================== PORÇÕES =====================================
  {
    id: "10",
    category: "Porções",
    name: "Fritas",
    price: 18.9,
    description: "Batatas sequinhas com páprica, lemon-peper, catupiry.",
    image: "/images/porcoes/batata.webp",
  },
  {
    id: "11",
    category: "Porções",
    name: "Filé Acebolado",
    price: 18.9,
    description: "Filé mignon com cebola.",
    image: "/images/porcoes/filezinho.webp",
  },
  {
    id: "12",
    category: "Porções",
    name: "Pastelzinho",
    price: 18.9,
    description: "Pastel de carne, queijo ou frango.",
    image: "/images/porcoes/pastel.jpg",
  },
  //=====================================================================================

  //====================================== BEBIDAS ======================================
  {
    id: "13",
    category: "Bebidas",
    name: "H2Oh",
    price: 9.9,
    description: "Refrigerante H2Oh 500ml.",
    image: "/images/bebidas/h2o.jpg",
  },
  {
    id: "14",
    category: "Bebidas",
    name: "Refrigerante 2 Litros",
    price: 9.9,
    description: "Refrigerante 2 Litros.",
    image: "/images/bebidas/refrigerante_2l.webp",
  },
  {
    id: "15",
    category: "Bebidas",
    name: "Água Mineral com Gás",
    price: 9.9,
    description: "Água Mineral com Gás 500ml.",
    image: "/images/bebidas/agua_com_gas.jpg",
  },
  {
    id: "16",
    category: "Bebidas",
    name: "Água Mineral sem Gás",
    price: 9.9,
    description: "Água Mineral sem Gás 500ml.",
    image: "/images/bebidas/agua_sem_gas.webp",
  },
  //=====================================================================================

  //====================================== VINHOS =======================================
  {
    id: "17",
    category: "Vinhos",
    name: "Vinho Chileno - Alto",
    price: 9.9,
    description: "Vinho Tinto Seco 750ml.",
    image: "/images/vinhos/vinho_chileno_alto.webp",
  },
  {
    id: "18",
    category: "Vinhos",
    name: "Vinho Chileno - Pailino",
    price: 9.9,
    description: "Vinho Tinto Suave 750ml.",
    image: "/images/vinhos/vinho_chileno_pailino.webp",
  },
  {
    id: "19",
    category: "Vinhos",
    name: "Vinho Chileno - Salta Vita",
    price: 9.9,
    description: "Vinho Tinto Suave 750ml.",
    image: "/images/vinhos/vinho_chileno_salta_vita.webp",
  },
  //====================================== VINHOS =======================================

  //====================================== SOBREMESAS ===================================
  {
    id: "20",
    category: "Sobremesas",
    name: "Pudim de Leite",
    price: 12.9,
    description: "Pudim de leite condensado.",
    image: "/images/sobremesas/pudinzinho.jpg",
  },
  {
    id: "21",
    category: "Sobremesas",
    name: "Sorvetes",
    price: 12.9,
    description: "Sorvete de creme, chocolate e morango.",
    image: "/images/sobremesas/sorvete.webp",
  },
  {
    id: "22",
    category: "Sobremesas",
    name: "Bolo de Pote",
    price: 12.9,
    description: "Bolo de pote com cobertura de chocolate.",
    image: "/images/sobremesas/bolo_no_pote.jpeg",
  },
];
