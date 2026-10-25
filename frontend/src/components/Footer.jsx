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
            <h3 className={styles.footerTitle}>Explore</h3>
            <ul>
              <li><a href="/#services">Services</a></li>
              <li><a href="/#how-it-works">How it works</a></li>
            </ul>
          </div>
          <div>
            <h3 className={styles.footerTitle}>Contact</h3>
            <ul>
              <li><a href="/#contact">Contact form</a></li>
            </ul>
          </div>
          <div>
            <h3 className={styles.footerTitle}>Legal</h3>
            <ul>
              <li><a href="/terms.html">Terms</a></li>
              <li><a href="/privacy.html">Privacy</a></li>
            </ul>
          </div>
        </nav>

        {/* Contact */}
        <div className={styles.footerContact}>
          <h3 className={styles.footerTitle}>Email</h3>
          <p><a href="mailto:jenacademia31@gmail.com">jenacademia31@gmail.com</a></p>
        </div>
      </div>

      <div className={styles.footerMeta}>
        <p>© {new Date().getFullYear()} JEN Academia. All rights reserved.</p>
      </div>
    </footer>
  );
}