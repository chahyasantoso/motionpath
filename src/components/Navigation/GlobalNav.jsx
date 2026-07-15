import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './GlobalNav.css';

export default function GlobalNav() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="global-nav">
      <div className="global-nav-container">
        <NavLink to="/" className="global-nav-logo" onClick={closeMenu}>
          <span className="logo-icon">✦</span> MotionPath
        </NavLink>

        {/* Desktop Links */}
        <div className="global-nav-links-desktop">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Hub
          </NavLink>
          <NavLink to="/hooks-demo" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Hooks
          </NavLink>
          <NavLink to="/burst" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Burst
          </NavLink>
          <NavLink to="/moto" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Motorcycle
          </NavLink>
          <NavLink to="/pasarmalam" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Night Market (Scrub)
          </NavLink>
          <NavLink to="/pasarmalam-observer" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Night Market (Obs)
          </NavLink>
          <NavLink to="/tower-defense" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Tower Defense
          </NavLink>
          <NavLink to="/spiral" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Zuma Spiral
          </NavLink>
          <NavLink to="/spike-refresh" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Spike (Refresh)
          </NavLink>
          <NavLink to="/spike-stagger" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Spike (Stagger)
          </NavLink>
        </div>

        {/* Mobile menu toggle */}
        <button 
          className={`global-nav-toggle ${isOpen ? 'open' : ''}`} 
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      <div className={`global-nav-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-links">
          <NavLink to="/" end className="drawer-link" onClick={closeMenu}>
            ✦ Dashboard Hub
          </NavLink>
          <NavLink to="/hooks-demo" className="drawer-link" onClick={closeMenu}>
            🚀 Hooks Demo
          </NavLink>
          <NavLink to="/burst" className="drawer-link" onClick={closeMenu}>
            🍓 Strawberry Burst
          </NavLink>
          <NavLink to="/moto" className="drawer-link" onClick={closeMenu}>
            🏍️ Motorcycle Ride
          </NavLink>
          <NavLink to="/pasarmalam" className="drawer-link" onClick={closeMenu}>
            🏮 Night Market (Scroll Scrub)
          </NavLink>
          <NavLink to="/pasarmalam-observer" className="drawer-link" onClick={closeMenu}>
            👁️ Night Market (Scroll Observer)
          </NavLink>
          <NavLink to="/tower-defense" className="drawer-link" onClick={closeMenu}>
            🗼 Tower Defense
          </NavLink>
          <NavLink to="/spiral" className="drawer-link" onClick={closeMenu}>
            🌀 Zuma Spiral
          </NavLink>
          <NavLink to="/spike-refresh" className="drawer-link" onClick={closeMenu}>
            ⚡ Performance Spike (Refresh)
          </NavLink>
          <NavLink to="/spike-stagger" className="drawer-link" onClick={closeMenu}>
            🎯 Stagger Jump Spike (Solution)
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
