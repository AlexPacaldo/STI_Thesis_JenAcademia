import styles from "../assets/footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.footerInner}>
        {/* Brand */}
        <div className={styles.footerBrand}>
          <a className={styles.brand} href="/">
            <span className={styles.brandMark}>JEN</span> ACADEMIA
          </a>
          <p className={styles.brandTagline}>
            Personalized online tutoring for every student.
          </p>
        </div>

        {/* Navigation */}
        <nav className={styles.footerNav} aria-label="Footer">
          <div>
            <h3 className={styles.footerTitle}>Product</h3>
            <ul>
              <li><a href="/register">Get Started</a></li>
              <li><a href="/pricing">Pricing</a></li>
              <li><a href="/teachers">Find a Teacher</a></li>
            </ul>
          </div>
          <div>
            <h3 className={styles.footerTitle}>Company</h3>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/careers">Careers</a></li>
              <li><a href="/contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className={styles.footerTitle}>Legal</h3>
            <ul>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/cookies">Cookies</a></li>
            </ul>
          </div>
        </nav>

        {/* Contact + Socials */}
        <div className={styles.footerContact}>
          <h3 className={styles.footerTitle}>Contact</h3>
          <p><a href="mailto:jenacademia@gmail.com">jenacademia@gmail.com</a></p>
          <div className={styles.socials} aria-label="Social media">
            <a className={styles.iconBtn} href="#" aria-label="Facebook">
              {/* Facebook */}
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M22 12a10 10 0 1 0-11.563 9.874v-6.987H7.898V12h2.54V9.797c0-2.506 1.492-3.89 3.775-3.89 1.093 0 2.237.195 2.237.195v2.46h-1.26c-1.242 0-1.63.771-1.63 1.562V12h2.773l-.443 2.887h-2.33v6.987A10.002 10.002 0 0 0 22 12z"/>
              </svg>
            </a>
            <a className={styles.iconBtn} href="#" aria-label="Instagram">
              {/* Instagram */}
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A5.5 5.5 0 1 1 6.5 13 5.5 5.5 0 0 1 12 7.5zm0 2A3.5 3.5 0 1 0 15.5 13 3.5 3.5 0 0 0 12 9.5zm5.25-2.25a.75.75 0 1 1-.75.75.75.75 0 0 1 .75-.75z"/>
              </svg>
            </a>
            <a className={styles.iconBtn} href="#" aria-label="X (Twitter)">
              {/* X / Twitter */}
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M13.3 10.8 20.9 2h-1.8l-6.6 7.6L7.7 2H2l8.1 11L2 22h1.8l6.9-8 5.1 8H22z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className={styles.footerMeta}>
        <p>© {new Date().getFullYear()} JEN Academia. All rights reserved.</p>
      </div>
    </footer>
  );
}