import { unlockOrderSound } from "../services/order-sound";
import { FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { adminHome, login } from "../services/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    void unlockOrderSound();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      navigate(adminHome(user), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <img src="/images/logo.png" alt="Pizzaria Jeitinho Brasileiro" />
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="login-heading">
            <small>Área de Login</small>
            <h2>Bem-Vindo de volta!</h2>
            <p>Entre com os dados do administrador.</p>
          </div>
          <label>
            Usuário
            <div>
              <UserRound />
              <input
                autoFocus
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Digite seu usuário"
              />
            </div>
          </label>
          <label>
            Senha
            <div>
              <LockKeyhole />
              <input
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Digite sua senha"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar no painel"}
          </button>
        </form>
      </section>
    </main>
  );
}
