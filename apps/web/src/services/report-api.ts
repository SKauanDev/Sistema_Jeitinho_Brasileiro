import { API_URL } from "./admin-api"; import type { ReportData,ReportFilters } from "../types/report";
async function request<T>(path:string):Promise<T>{const response=await fetch(`${API_URL}${path}`,{headers:{Authorization:`Bearer ${localStorage.getItem("urfood_token")}`}});const data=await response.json() as T&{message?:string};if(!response.ok)throw new Error(data.message??"Falha ao gerar relatório.");return data;}
export const reportApi={filters:()=>request<ReportFilters>("/admin/reports/filters"),generate:(params:URLSearchParams)=>request<ReportData>(`/admin/reports?${params}`)};
