import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, Edit3, KeyRound, LoaderCircle, Plus, Search, ShieldCheck, UserCheck, UserRoundCog, UserX, X } from "lucide-react";
import { userApi } from "../../services/user-api";
import type { AdminUser, AdminUserInput } from "../../types/user";

const emptyForm: AdminUserInput = { name: "", username: "", email: "", password: "" };

export function UsersModule() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { setError(""); try { setUsers(await userApi.list()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar usuários."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => users.filter(user => `${user.name} ${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  if (loading) return <div className="admin-state"><LoaderCircle className="spinner" /><h2>Carregando usuários...</h2></div>;
  return <div className="admin-module users-module">
    <div className="module-title"><div><span>CONTROLE DE ACESSO</span><h1>Usuários</h1><p>Crie e gerencie os acessos da equipe ao painel administrativo.</p></div><button className="primary-admin" onClick={() => setEditing("new")}><Plus /> Novo usuário</button></div>
    {error && <div className="admin-inline-error"><AlertCircle />{error}<button onClick={() => setError("")}><X /></button></div>}
    <section className="user-summary"><article><UserRoundCog /><span><small>Usuários cadastrados</small><strong>{users.length}</strong></span></article><article><UserCheck /><span><small>Acessos ativos</small><strong>{users.filter(user => user.active).length}</strong></span></article><article><UserX /><span><small>Acessos bloqueados</small><strong>{users.filter(user => !user.active).length}</strong></span></article></section>
    <article className="panel users-panel"><header><div><h2>Contas do painel</h2><p>Senhas são protegidas e nunca ficam visíveis após o cadastro.</p></div><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuário" /></label></header>
      <div className="admin-users-table"><div className="admin-users-head"><span>Usuário</span><span>Login</span><span>Perfil</span><span>Status</span><span>Criado em</span><span>Ações</span></div>{filtered.map(user => <div className={!user.active ? "inactive" : ""} key={user.id}><span className="admin-user-name"><i>{user.name.slice(0,1).toUpperCase()}</i><span><strong>{user.name}</strong><small>{user.email}</small></span></span><span>@{user.username}</span><span><b className={`user-role ${user.role.toLowerCase()}`}><ShieldCheck />{user.role === "ADMIN" ? "Administrador" : "Operador"}</b></span><span><button disabled={user.role === "ADMIN"} className={`user-active-toggle ${user.active ? "active" : ""}`} onClick={async () => { try { await userApi.setActive(user.id, !user.active); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao alterar acesso."); } }}><i />{user.active ? "Ativo" : "Bloqueado"}</button></span><span>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</span><span><button disabled={user.role === "ADMIN"} title="Editar usuário ou redefinir senha" onClick={() => setEditing(user)}><Edit3 /></button></span></div>)}</div>
      {!filtered.length && <div className="panel-empty"><UserRoundCog /><p>Nenhum usuário encontrado.</p></div>}
    </article>
    {editing && <UserDialog user={editing === "new" ? null : editing} saving={saving} onClose={() => setEditing(null)} onSave={async input => { setSaving(true); setError(""); try { if (editing === "new") await userApi.create({ ...input, password: input.password ?? "" }); else await userApi.update(editing.id, input); setEditing(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar usuário."); } finally { setSaving(false); } }} />}
  </div>;
}

function UserDialog({ user, saving, onClose, onSave }: { user: AdminUser | null; saving: boolean; onClose: () => void; onSave: (input: AdminUserInput) => Promise<void> }) {
  const [form, setForm] = useState<AdminUserInput>(user ? { name:user.name, username:user.username, email:user.email, password:"" } : emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  return <div className="inventory-dialog-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="inventory-dialog user-dialog"><header><div><span>ACESSO AO PAINEL</span><h2>{user ? "Editar usuário" : "Novo usuário"}</h2></div><button onClick={onClose}><X /></button></header><form className="inventory-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave(form); }}><label className="full">Nome completo<input required minLength={3} value={form.name} onChange={event => setForm({...form,name:event.target.value})} placeholder="Nome do cliente" /></label><label>Usuário<input required minLength={3} maxLength={40} value={form.username} onChange={event => setForm({...form,username:event.target.value.toLowerCase().replace(/\s/g,"")})} placeholder="usuario.login" /></label><label>E-mail<input required type="email" value={form.email} onChange={event => setForm({...form,email:event.target.value})} placeholder="cliente@empresa.com" /></label><label className="full">{user ? "Nova senha (opcional)" : "Senha inicial"}<div className="user-password-field"><KeyRound /><input required={!user} minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={event => setForm({...form,password:event.target.value})} placeholder={user ? "Deixe vazio para manter a senha" : "Mínimo de 8 caracteres"} /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Ocultar" : "Mostrar"}</button></div><small>{user ? "Preencha somente se quiser redefinir a senha." : "O cliente poderá entrar imediatamente com essa senha."}</small></label><div className="user-access-note full"><ShieldCheck /><span><strong>Perfil Operador</strong><small>A conta terá acesso aos módulos operacionais, mas não poderá criar outros usuários.</small></span></div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="save" disabled={saving}>{saving && <LoaderCircle className="spinner" />} Salvar usuário</button></footer></form></section></div>;
}
