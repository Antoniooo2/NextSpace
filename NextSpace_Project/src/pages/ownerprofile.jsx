import { useState } from "react";
import logo from '../assets/NextSpace_logo.png'
import premisesSantaTecla from '../assets/premisesSantaTecla.jpg'
import medicalColonyOffice from '../assets/medicalColonyOffice.jpg'


export default function OwnerProfile({ onNavigate = () => {} }) {
  const navy = "#0F2A52";
  const navyDark = "#0B1F3D";
  const blue = "#4A7FAE";
  const peri = "#93AFDA";
  const bg = "#F4F6FA";
  const border = "#E5EAF3";
  const muted = "#7C8AA5";

  const [activeNav, setActiveNav] = useState("profile");
  const [brokenImgs, setBrokenImgs] = useState([]);

  const user = {
    name: "Juan Delgado",
    role: "Entrepreneur",
    plan: "PLAN PREMIUM",
    email: "j.delgado@vivaelsalvador.com",
    phone: "+503 7890-1234",
    department: "San Salvador, El Salvador",
    businessType: "Venta minorista / Retail",
  };

  const navItems = [
    { key: "marketplace",   label: "Marketplace",   icon: "bi-grid" },
    { key: "advisor",       label: "AI Advisor",    icon: "bi-stars" },
    { key: "contracts",     label: "Contracts",     icon: "bi-file-earmark-text" },
    { key: "payments",      label: "Payments",      icon: "bi-credit-card" },
    { key: "notifications", label: "Notifications", icon: "bi-bell" },
    { key: "profile",       label: "Profile",       icon: "bi-person" },
  ];

  const stats = [
    { key: "favorites", label: "Favorites", value: "08", icon: "bi-bookmark" },
    { key: "contracts", label: "Contracts", value: "01", icon: "bi-file-earmark-text" },
    { key: "searches",  label: "Searches",  value: "24", icon: "bi-search" },
    { key: "messages",  label: "Messages",  value: "12", icon: "bi-chat" },
  ];

  const savedProperties = [
    {id: 1,
    title: "Premises in Santa Tecla Centro",
    address: "Manuel Gallardo Avenue",
    price: "$1,200",
    image: premisesSantaTecla,
    },
    {id: 2,
    title: "Medical Colony Office",
    address: "Dr. Guillermo Passage",
    price: "$850",
    image: medicalColonyOffice,
    },
];

  const fields = [
    { label: "Contact Email", value: user.email },
    { label: "Phone",         value: user.phone },
    { label: "Department",    value: user.department },
    { label: "Business Type", value: user.businessType },
  ];

  const settings = [
    { key: "change-password", icon: "bi-key",  title: "Change Password", desc: "Update your access key for security" },
    { key: "notifications",   icon: "bi-bell", title: "Notifications",   desc: "Manage email and push alerts" },
  ];

  const initials = user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const handleNav = (key) => {
    setActiveNav(key);
    onNavigate(key);
  };

  const markBroken = (id) => setBrokenImgs((prev) => [...prev, id]);

  const navVars = {
    "--bs-nav-link-color": "rgba(255,255,255,.68)",
    "--bs-nav-link-hover-color": "#fff",
    "--bs-nav-link-font-size": ".875rem",
    "--bs-nav-pills-link-active-color": "#fff",
    "--bs-nav-pills-link-active-bg": "rgba(147,175,218,.18)",
  };
  const outlineBtnVars = {
    "--bs-btn-color": blue,
    "--bs-btn-border-color": blue,
    "--bs-btn-hover-bg": blue,
    "--bs-btn-hover-border-color": blue,
    "--bs-btn-active-bg": navy,
    "--bs-btn-active-border-color": navy,
  };
  const iconBtnVars = { "--bs-btn-color": muted, "--bs-btn-hover-color": blue };
  const dangerBtnVars = { "--bs-btn-color": muted, "--bs-btn-hover-color": "var(--bs-danger)" };
  const linkBtnVars = { "--bs-btn-color": blue, "--bs-btn-hover-color": navy };
  const listVars = {
    "--bs-list-group-border-color": "#F1F4F9",
    "--bs-list-group-action-hover-bg": "#F7F9FD",
    "--bs-list-group-action-hover-color": navy,
  };
  const cardStyle = { borderColor: border };

  return (
    <div className="d-flex min-vh-100" style={{ background: bg, scrollbarGutter: "stable" }}>

      <aside
        className="d-flex flex-column flex-shrink-0 position-sticky top-0 vh-100 py-3 px-2 px-lg-3"
        style={{ background: navy }}
      >
        <div
          className="d-flex align-items-center justify-content-center"
          style={{
            height: 58,
            backgroundColor: "#fff",
            margin: "-16px -16px 16px -16px",
            }}
            >
            <img
                src={logo}
                alt="NextSpace"
                style={{ height: 40, width: "auto" }}
            />
            </div>
            

        <ul className="nav nav-pills flex-column gap-1 flex-grow-1" style={navVars}>
          {navItems.map((item) => (
            <li className="nav-item" key={item.key}>
              <button
                type="button"
                className={`nav-link w-100 d-flex align-items-center gap-2 border-start border-3 rounded-end-3 justify-content-center justify-content-lg-start ${
                  activeNav === item.key ? "active" : ""
                }`}
                style={{ borderLeftColor: activeNav === item.key ? peri : "transparent" }}
                onClick={() => handleNav(item.key)}
              >
                <i className={`bi ${item.icon}`} />
                <span className="d-none d-lg-inline">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="btn d-flex align-items-center gap-2 p-2 rounded-3 border-0 text-start"
          style={{ "--bs-btn-bg": "rgba(255,255,255,.08)", "--bs-btn-hover-bg": "rgba(255,255,255,.16)" }}
          onClick={() => handleNav("profile")}
        >
          <span
            className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
            style={{ width: 34, height: 34, fontSize: ".78rem", background: `linear-gradient(135deg, ${blue}, ${peri})` }}
          >
            {initials}
          </span>
          <span className="d-none d-lg-flex flex-column lh-sm text-truncate">
            <span className="text-white small fw-semibold">{user.name}</span>
            <span style={{ color: peri, fontSize: ".62rem", letterSpacing: ".04em" }}>{user.plan}</span>
          </span>
        </button>
      </aside>

      <main className="flex-grow-1 min-w-0">
        {}
        <header
          className="d-flex align-items-center justify-content-between bg-white border-bottom px-3 px-md-4 position-sticky top-0"
          style={{ height: 58, zIndex: 5 }}
        >
          <h1 className="h6 mb-0 fw-semibold" style={{ color: navy }}>My profile</h1>
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none p-1"
              style={iconBtnVars}
              aria-label="Notifications"
            >
              <i className="bi bi-bell" />
            </button>
            <span className="d-flex align-items-center gap-2 small">
              {user.name}
              <i className="bi bi-person-circle fs-5" style={{ color: muted }} />
            </span>
          </div>
        </header>

        <div className="container-fluid p-3 p-md-4" style={{ maxWidth: 1080 }}>
          <div className="row g-3">

            <div className="col-12 col-lg-4">
              <div className="card shadow-sm rounded-4 overflow-hidden h-100" style={cardStyle}>
                <div style={{ height: 78, background: `linear-gradient(135deg, ${navyDark}, ${navy})` }} />

                <div className="card-body text-center pt-0 px-3 pb-3">
                  <div className="d-flex justify-content-center" style={{ marginTop: -40 }}>
                    <span
                      className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white border border-4 border-white"
                      style={{ width: 76, height: 76, fontSize: "1.4rem", background: `linear-gradient(135deg, ${blue}, ${peri})` }}
                    >
                      {initials}
                    </span>
                  </div>

                  <h2 className="h6 fw-bold mt-3 mb-2" style={{ color: navy }}>{user.name}</h2>
                  <span
                    className="badge rounded-pill d-inline-flex align-items-center gap-1 fw-semibold"
                    style={{ background: "rgba(74,127,174,.12)", color: blue }}
                  >
                    <i className="bi bi-briefcase" />
                    {user.role}
                  </span>

                  <div className="text-start mt-4">
                    {fields.map((f) => (
                      <div className="mb-3" key={f.label}>
                        <label className="form-label mb-1" style={{ color: muted, fontSize: ".7rem" }}>
                          {f.label}:
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm rounded-3"
                          style={{ ...cardStyle, background: "#FBFCFE" }}
                          value={f.value}
                          readOnly
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline-primary w-100 rounded-3 d-inline-flex align-items-center justify-content-center gap-2 fw-semibold"
                    style={outlineBtnVars}
                    onClick={() => handleNav("profile-edit")}
                  >
                    <i className="bi bi-pencil" />
                    Edit Profile
                  </button>
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-8">
              {/* Stats */}
              <div className="row g-3">
                {stats.map((s) => (
                  <div className="col-6 col-md-3" key={s.key}>
                    <div className="card shadow-sm rounded-4 h-100" style={cardStyle}>
                      <div className="card-body p-3 d-flex flex-column">
                        <i className={`bi ${s.icon} mb-2`} style={{ color: muted }} />
                        <span style={{ color: muted, fontSize: ".7rem" }}>{s.label}</span>
                        <span className="fs-4 fw-bold lh-1 mt-1" style={{ color: navy }}>{s.value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="d-flex align-items-center justify-content-between mt-4 mb-2">
                <h3 className="h6 mb-0 fw-semibold" style={{ color: navy }}>Saved Properties</h3>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-decoration-none flex-shrink-0 ms-auto me-1"
                  style={linkBtnVars}
                  onClick={() => handleNav("marketplace")}
                >
                  View all
                </button>
              </div>

              <div className="row g-3">
                {savedProperties.map((p) => (
                  <div className="col-12 col-md-6" key={p.id}>
                    <div className="card shadow-sm rounded-4 h-100" style={cardStyle}>
                      <div className="card-body d-flex align-items-center gap-3 p-2">
                        {brokenImgs.includes(p.id) ? (
                          <span
                            className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0"
                            style={{ width: 68, height: 58, background: `linear-gradient(135deg, ${peri}, ${blue})` }}
                          >
                            <i className="bi bi-building fs-5" />
                          </span>
                        ) : (
                          <img
                            src={p.image}
                            alt={p.title}
                            className="rounded-3 object-fit-cover flex-shrink-0"
                            style={{ width: 68, height: 58 }}
                            onError={() => markBroken(p.id)}
                          />
                        )}

                        <div className="flex-grow-1 min-w-0">
                          <h4 className="fw-bold text-truncate mb-1" style={{ fontSize: ".8rem", color: navy }}>
                            {p.title}
                          </h4>
                          <p className="mb-2" style={{ fontSize: ".7rem", color: muted }}>{p.address}</p>
                          <span className="fw-bold" style={{ color: blue }}>
                            {p.price}
                            <small className="fw-semibold">/month</small>
                          </span>
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-link text-decoration-none"
                          style={dangerBtnVars}
                          aria-label={`Remove ${p.title}`}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card shadow-sm rounded-4 overflow-hidden mt-3" style={cardStyle}>
                <div className="card-header bg-white fw-semibold" style={{ ...cardStyle, color: navy }}>
                  Account Settings
                </div>

                <div className="list-group list-group-flush" style={listVars}>
                  {settings.map((s) => (
                    <button
                      type="button"
                      key={s.key}
                      className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3 border-0 border-bottom"
                      onClick={() => handleNav(s.key)}
                    >
                      <i className={`bi ${s.icon} fs-6 text-center`} style={{ color: blue, width: 22 }} />
                      <span className="flex-grow-1 d-flex flex-column lh-sm">
                        <span className="fw-semibold" style={{ fontSize: ".82rem", color: navy }}>{s.title}</span>
                        <span style={{ fontSize: ".7rem", color: muted }}>{s.desc}</span>
                      </span>
                      <i className="bi bi-chevron-right small" style={{ color: muted }} />
                    </button>
                  ))}

                  <button
                    type="button"
                    className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3 border-0"
                    onClick={() => handleNav("logout")}
                  >
                    <i className="bi bi-box-arrow-right fs-6 text-danger text-center" style={{ width: 22 }} />
                    <span className="flex-grow-1 d-flex flex-column lh-sm">
                      <span className="fw-semibold text-danger" style={{ fontSize: ".82rem" }}>Log Out</span>
                      <span className="text-danger opacity-75" style={{ fontSize: ".7rem" }}>Securely log out</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
