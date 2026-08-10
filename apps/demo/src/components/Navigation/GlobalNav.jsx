import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import "./GlobalNav.css";

export default function GlobalNav() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);
  const links = [
    ["/", "Hub"],
    ["/hooks-demo", "Hooks"],
    ["/burst", "Burst"],
    ["/walker", "FK Walker"],
    ["/moto", "Motorcycle"],
    ["/pasarmalam", "Night Market (Scrub)"],
    ["/pasarmalam-observer", "Night Market (Obs)"],
    ["/tower-defense", "Tower Defense"],
    ["/spiral", "Zuma Spiral"],
    ["/spiral-graph", "Zuma Spiral (Graph)"],
    ["/spike-refresh", "Spike (Refresh)"],
    ["/spike-stagger", "Spike (Stagger)"],
  ];
  return (
    <nav className="global-nav">
      <div className="global-nav-container">
        <NavLink to="/" className="global-nav-logo" onClick={closeMenu}>
          <span className="logo-icon">✦</span> MotionPath
        </NavLink>
        <div className="global-nav-links-desktop">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
        <button
          className={`global-nav-toggle ${isOpen ? "open" : ""}`}
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>
      </div>
      <div className={`global-nav-drawer ${isOpen ? "open" : ""}`}>
        <div className="drawer-links">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className="drawer-link"
              onClick={closeMenu}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
