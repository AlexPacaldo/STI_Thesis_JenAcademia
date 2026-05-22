// src/pages/Homepage.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/homepage.module.css";
import SignUp from "../assets/img/homepage/signup.png";
import Match from "../assets/img/homepage/match.png";
import Learning from "../assets/img/homepage/learning.png";
import Girl from "../assets/img/homepage/Girl.png";


const processSteps = [
  {
    icon: SignUp,
    alt: "Login icon",
    title: "Login",
    description: "Login to your profile and access your personalized learning dashboard.",
  },
  {
    icon: Match,
    alt: "Match with Tutor",
    title: "Match with Tutor",
    description: "Find the best teacher for your goals with smart, student-centered pairing.",
  },
  {
    icon: Learning,
    alt: "Start Learning",
    title: "Start Learning",
    description: "Begin your journey with clear lessons, progress tracking, and teacher feedback.",
  },
];

const features = [
  {
    icon: "📘",
    title: "Online English Courses",
    description: "Business English, IELTS prep, conversational lessons, and travel English support.",
  },
  {
    icon: "🧾",
    title: "Class Contracts",
    description: "Choose 10, 15, or 20 lessons with flexible 25-minute or 1-hour packages.",
  },
  {
    icon: "💰",
    title: "Affordable Pricing",
    description: "Transparent pricing and study plans that fit both budgets and busy schedules.",
  },
  {
    icon: "🎓",
    title: "Trial Classes",
    description: "A 10-minute trial to assess level and preferences before you commit.",
  },
  {
    icon: "🤖",
    title: "AI-Powered Matching",
    description: "Smart pairing to match students with tutors who fit their learning goals.",
  },
  {
    icon: "✅",
    title: "Verified Tutors",
    description: "Experienced instructors with strong teaching records and friendly support.",
  },
  {
    icon: "📅",
    title: "Flexible Scheduling",
    description: "Book, cancel, or reschedule classes with an easy calendar workflow.",
  },
  {
    icon: "🔒",
    title: "Secure & Easy Access",
    description: "All classes and learning materials are protected and available anytime.",
  },
];

export default function Homepage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className={styles.page}>
      <section className={styles.heroHeader}>
        <div className={styles.heroTop}>
          <Link to="/" className={styles.logo}>
            <i>JEN Academia</i>
          </Link>
          

          <div className={styles.actionGroup}>
            <Link to="/login" className={styles.navButton}>
              Login
            </Link>
            <button
              className={styles.mobileMenuButton}
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle menu"
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        <div className={`${styles.mobileNav} ${mobileMenuOpen ? styles.open : ""}`}>
          <Link to="/login" className={styles.mobileLogin} onClick={() => setMobileMenuOpen(false)}>
            Login
          </Link>
        </div>
        <br></br><br></br><br></br>

        <div className={styles.heroSection}>
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>Personalized Learning, Better Results</span>
            <h3 className={styles.heroTitle}>Personalized Online Tutoring for Every Student</h3>
            <p className={styles.heroDescription}>
              Learn smarter, achieve better with JEN Academia. Get matched with tutors, book classes, and
              track your progress through a refined learning system.
            </p>

            <div className={styles.heroActions}>
              <Link to="/login" className={styles.ctaButton}>
                Start Learning
              </Link>
              {/* <Link to="/courses" className={styles.secondaryButton}>
                Explore Courses
              </Link> */}
            </div>

            <div className={styles.heroMeta}>
              <div className={styles.avatarRow}>
                <span className={styles.avatar}>J</span>
                <span className={styles.avatar}>E</span>
                <span className={styles.avatar}>N</span>
              </div>
              <span className={styles.heroMetaText}>Join English Now</span>
            </div>
          </div>

          <div className={styles.heroPreview}>
            <div className={styles.heroVisual}>
              <div className={styles.heroVisualCard}>
                <img src={Girl} alt="Student learning online with laptop" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.processSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>How it works</span>
          <h2>A simple 3-step process for every learner</h2>
        </div>

        <div className={styles.processGrid}>
          {processSteps.map((step, index) => (
            <article key={step.title} className={styles.processCard}>
              <div className={styles.processCardTop}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div className={styles.processCardIcon}>
                  <img src={step.icon} alt={step.alt} />
                </div>
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
      
      <div className={styles.services}>
        <section className={styles.servicesIntro}>
          <div className={styles.introCopy}>
            <span>Our services</span>
            <br></br>
            <h2><strong>Explore the wealth of knowledge we offer.</strong></h2>
            <br></br>
            <p>
              Discover flexible course packages, trial classes, AI-assisted matching, and secure access across every lesson.
            </p>
          </div>
          <br></br>
          <div className={styles.introAction}>
            <Link to="/login" className={styles.ctaButton}>
              Start Learning
            </Link>
          </div>
        </section>

        <section className={styles.featureGrid}>
          {features.map((feature) => (
            <article key={feature.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3 className={styles.featureCardTitle}>{feature.title}</h3>
              <p className={styles.featureCardDescription}>{feature.description}</p>
            </article>
          ))}
        </section>
      </div>
      
    </main>
  );
}
