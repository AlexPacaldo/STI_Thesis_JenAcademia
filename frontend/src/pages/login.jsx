import { useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/Login.module.css";

export default function Login() {
  const { notify } = useNotification() || {};
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e) {
  e.preventDefault();

  try {
    const res = await fetch("http://localhost:3001/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Backend sent an error status
      notify(data.message || "Login failed", "error");
      return;
    }

    // Save user and route by role
    localStorage.setItem("user", JSON.stringify(data.user));
    
    // If profile is not complete, always redirect to account page
    if (!data.user.profileCompleted) {
      window.location.href = "/account";
      return;
    }
    
    if (data.user.role === "teacher") {
      window.location.href = "/TeacherDashboard";
    }else if(data.user.role === "admin"){
      window.location.href = "/AdminDashboard";
    } else {
      window.location.href = "/StudentDashboard";
    }
  } catch (err) {
    console.error("Login error:", err);
    notify("Network or server error. Please try again.", "error");
  }
}

  return (
    <div className={styles.cont}>
      <section className={styles.Center}>
        <div className={styles.Title}>
          <h1><b>Welcome!</b></h1>
        </div>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="Enter your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Enter your Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <br />
          <button type="submit" className={styles.submitbtn}>
            Log In
          </button>
        </form>

        <div className={styles.forgotPass}>
          <a href="#">Forgot Password?</a>
        </div>
      </section>
    </div>
  );
}
