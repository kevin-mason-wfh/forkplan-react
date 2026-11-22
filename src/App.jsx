import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { auth, session } from './api.js';
import { Field, useUI } from './ui.jsx';
import Home from './views/Home.jsx';
import MealPlan from './views/MealPlan.jsx';
import Recipes from './views/Recipes.jsx';
import Ingredients from './views/Ingredients.jsx';
import Pantry from './views/Pantry.jsx';
import Shopping from './views/Shopping.jsx';
import Account from './views/Account.jsx';
import Transfer from './views/Transfer.jsx';
import Water from './views/Water.jsx';
import NutritionSummary from './views/NutritionSummary.jsx';

const FULL = [['/', 'Home'], ['/plan', 'Meal Plan'], ['/recipes', 'Recipes'], ['/ingredients', 'Ingredients'], ['/pantry', 'Pantry'], ['/shopping', 'Shopping'], ['/water', 'Water Log'], ['/nutrition', 'Nutrition Summary'], ['/data', 'Import / Export'], ['/account', 'Account']];
const NAV = [['/plan', '📅', 'Meal Plan'], ['/pantry', '🥫', 'Pantry'], ['/shopping', '🛒', 'Shopping']];
const MORE = [['/recipes', '📖', 'Recipes'], ['/ingredients', '🥕', 'Ingredients'], ['/water', '💧', 'Water Log'], ['/nutrition', '📊', 'Nutrition Summary'], ['/data', '📦', 'Import / Export'], ['/account', '👤', 'Account']];

function AuthScreen({ onDone }) {
  const { run, toast } = useUI();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (mode === 'signin') { if (await run(() => auth.signIn(email.trim(), password))) onDone(); }
    else if (mode === 'signup') {
      if (password.length < 8) return toast('Password must be at least 8 characters', true);
      if (await run(() => auth.signUp(email.trim(), password), 'Check your email for a code')) setMode('confirm');
    } else if (await run(() => auth.confirm(email.trim(), code.trim()), 'Email confirmed — sign in')) setMode('signin');
  };
  return (
    <div className="auth">
      <h1>🍴 Forkplan</h1>
      <form className="card" onSubmit={submit}>
        <Field label="Email"><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        {mode !== 'confirm' && <Field label="Password"><input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></Field>}
        {mode === 'confirm' && <Field label="Confirmation code"><input inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} /></Field>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn grow">{{ signin: 'Sign in', signup: 'Create account', confirm: 'Confirm email' }[mode]}</button>
          {mode === 'confirm' && <button type="button" className="btn ghost" onClick={() => run(() => auth.resend(email.trim()), 'Code resent')}>Resend</button>}
        </div>
        <p className="muted">
          {mode === 'signin' ? <>New here? <a href="#" onClick={e => { e.preventDefault(); setMode('signup'); }}>Create an account</a></>
            : <>Have an account? <a href="#" onClick={e => { e.preventDefault(); setMode('signin'); }}>Sign in</a></>}
        </p>
      </form>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(!!session.tokens);
  const { toast } = useUI();
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    const h = () => { toast('Session expired', true); setSignedIn(false); };
    window.addEventListener('fp:signedout', h);
    return () => window.removeEventListener('fp:signedout', h);
  }, [toast]);
  if (!signedIn) return <AuthScreen onDone={() => setSignedIn(true)} />;
  return (
    <div className="shell">
      <nav className="side desk">
        <div className="logo"><img src="/logo.png" alt="" />Forkplan</div>
        {FULL.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}
        <div className="spacer" />
        <a onClick={async () => { await auth.signOut(); setSignedIn(false); }}>Sign out</a>
      </nav>
      <nav className="side compact">
        <NavLink to="/" end className={({ isActive }) => 'logo' + (isActive ? ' active' : '')} aria-label="Home"><span className="ni"><img src="/logo.png" alt="" /></span><span className="nl">Forkplan</span></NavLink>
        {NAV.map(([to, icon, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}><span className="ni">{icon}</span><span className="nl">{label}</span></NavLink>)}
        <button type="button" className={'morebtn' + (more || MORE.some(([to]) => pathname.startsWith(to)) ? ' active' : '')} aria-expanded={more} onClick={() => setMore(m => !m)}><span className="ni dots"><i /><i /><i /></span><span className="nl">More</span></button>
        {more && <div className="subnav" role="menu">
          {MORE.map(([to, icon, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}><span className="ni">{icon}</span>{label}</NavLink>)}
          <a className="signout" onClick={async () => { await auth.signOut(); setSignedIn(false); }}><span className="ni">🚪</span>Sign out</a>
        </div>}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<MealPlan />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/pantry" element={<Pantry />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/water" element={<Water />} />
          <Route path="/nutrition" element={<NutritionSummary />} />
          <Route path="/data" element={<Transfer />} />
          <Route path="/account" element={<Account signOut={() => setSignedIn(false)} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
