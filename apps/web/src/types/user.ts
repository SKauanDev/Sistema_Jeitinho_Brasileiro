export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserInput = {
  name: string;
  username: string;
  email: string;
  password?: string;
};
