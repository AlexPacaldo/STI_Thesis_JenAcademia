// src/pages/Homepage.jsx
import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import FoldText from "../components/FoldText";
import SpecularButton from "../components/SpecularButton";
import TextType from "../components/TextType";
import styles from "../assets/homepage.module.css";
import Girl from "../assets/img/homepage/Girl.png";
import JenLogo from "../assets/img/homepage/jenlog.png";

const processSteps = [
  {
    icon: "trial",
    title: "Start with a 10-minute trial",
    description:
      "Contact the admin or owner outside the system to schedule a short trial class and discuss your English goals.",
  },
  {
    icon: "contract",
    title: "Agree on your class contract",
    description:
      "After the trial, the admin or owner explains the available contract options and confirms the plan once you agree.",
  },
  {
    icon: "link",
    title: "Open your account link",
    description:
      "The admin or owner creates your student account, sends your account link, and you finish setting up your profile.",
  },
  {
    icon: "calendar",
    title: "Book classes and start learning",
    description:
      "Once your account is ready, you can use the student side to book lessons, access class details, and follow your progress.",
  },
];

const features = [
  {
    icon: "course",
    title: "Online English Courses",
    description: "Business English, IELTS prep, conversation practice, and travel-ready speaking lessons.",
    className: styles.serviceCourse,
  },
  {
    icon: "contract",
    title: "Class Contracts",
    description: "Choose 10, 15, or 20 lessons with 25-minute or 1-hour class packages.",
    className: styles.serviceContract,
  },
  {
    icon: "price",
    title: "Affordable Pricing",
    description: "Transparent plans that fit different learning goals, budgets, and schedules.",
    className: styles.serviceCompact,
  },
  {
    icon: "trial",
    title: "Trial Classes",
    description: "A 10-minute trial to assess level and preferences before you commit.",
    className: styles.serviceCompact,
  },
  {
    icon: "match",
    title: "AI-Powered Matching",
    description: "Smart pairing to match students with tutors who fit their learning goals.",
    className: styles.serviceMatching,
  },
  {
    icon: "verified",
    title: "Verified Tutors",
    description: "Experienced instructors with strong teaching records and friendly support.",
    className: styles.serviceCompact,
  },
  {
    icon: "calendar",
    title: "Flexible Scheduling",
    description: "Book, cancel, or reschedule classes with an easy calendar workflow.",
    className: styles.serviceSchedule,
  },
  {
    icon: "secure",
    title: "Secure & Easy Access",
    description: "All classes and learning materials are protected and available anytime.",
    className: styles.serviceSecure,
  },
];

const contactMethods = [
  {
    icon: "email",
    label: "Email us",
    value: "jenacademia@gmail.com",
    href: "mailto:jenacademia@gmail.com",
  },
  {
    icon: "facebook",
    label: "Message JEN Academia",
    value: "Facebook page",
    href: "#",
  },
  {
    icon: "support",
    label: "Learning support",
    value: "Trial classes, packages, and tutor matching",
    href: "#",
  },
];

const infoCards = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M15.75 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M3.25 20a5.75 5.75 0 0 1 11.5 0v.5H3.25V20Z" />
        <path d="M14.8 20.5v-.65a7.1 7.1 0 0 0-1.45-4.3A4.8 4.8 0 0 1 21 19.4v1.1h-6.2Z" />
      </svg>
    ),
    title: "1:1 Tutor Matching",
    description: "We match you with the right tutor for you.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5Zm0 17.5a7.75 7.75 0 1 1 0-15.5 7.75 7.75 0 0 1 0 15.5Z" />
        <path d="M13 7.25h-2v5.2l4.35 3.05 1.15-1.65-3.5-2.45V7.25Z" />
      </svg>
    ),
    title: "10-Min Trial Class",
    description: "Experience our classes with a free trial.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2.5h2v2h6v-2h2v2h2.25A2.75 2.75 0 0 1 22 7.25v11.5a2.75 2.75 0 0 1-2.75 2.75H4.75A2.75 2.75 0 0 1 2 18.75V7.25A2.75 2.75 0 0 1 4.75 4.5H7v-2Zm12.25 17A.75.75 0 0 0 20 18.75v-8.5H4v8.5c0 .41.34.75.75.75h14.5ZM4.75 6.5a.75.75 0 0 0-.75.75v1h16v-1a.75.75 0 0 0-.75-.75H17v1h-2v-1H9v1H7v-1H4.75Z" />
        <path d="M7 12h3v3H7v-3Zm5 0h3v3h-3v-3Zm-5 4h3v2H7v-2Zm5 0h3v2h-3v-2Z" />
      </svg>
    ),
    title: "24/7 Easy Booking",
    description: "Book, reschedule, or cancel anytime, anywhere.",
  },
];

const processIcons = {
  trial: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5Zm0 17.5a7.75 7.75 0 1 1 0-15.5 7.75 7.75 0 0 1 0 15.5Z" />
      <path d="M13 7.25h-2v5.2l4.35 3.05 1.15-1.65-3.5-2.45V7.25Z" />
    </svg>
  ),
  contract: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.75 2.5h8.7L20 7.05v14.2H6.75A2.75 2.75 0 0 1 4 18.5V5.25A2.75 2.75 0 0 1 6.75 2.5Zm7.75 1.95V8h3.55L14.5 4.45Z" />
      <path d="M7.25 11h9.5v2h-9.5v-2Zm0 4h6.5v2h-6.5v-2Z" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.25a4.75 4.75 0 1 0 0-9.5 4.75 4.75 0 0 0 0 9.5Z" />
      <path d="M4.25 21.25a7.75 7.75 0 0 1 15.5 0H4.25Z" />
      <path d="M17.25 8.25h-3v-2h3A4.75 4.75 0 0 1 22 11a4.75 4.75 0 0 1-4.75 4.75h-3v-2h3A2.75 2.75 0 0 0 20 11a2.75 2.75 0 0 0-2.75-2.75Z" />
      <path d="M6.75 8.25h3v-2h-3A4.75 4.75 0 0 0 2 11a4.75 4.75 0 0 0 4.75 4.75h3v-2h-3A2.75 2.75 0 0 1 4 11a2.75 2.75 0 0 1 2.75-2.75Z" />
      <path d="M8 10h8v2H8v-2Z" />
    </svg>
  ),
  match: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 4a4.5 4.5 0 0 0-3.18 7.68L12 18.36l6.68-6.68A4.5 4.5 0 0 0 12.32 5.3L12 5.62l-.32-.32A4.47 4.47 0 0 0 8.5 4Z" />
      <path d="M11 8h2v3h3v2h-3v3h-2v-3H8V11h3V8Z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.5h2v2h6v-2h2v2h2.25A2.75 2.75 0 0 1 22 7.25v11.5a2.75 2.75 0 0 1-2.75 2.75H4.75A2.75 2.75 0 0 1 2 18.75V7.25A2.75 2.75 0 0 1 4.75 4.5H7v-2Zm13 7.75H4v8.5c0 .41.34.75.75.75h14.5a.75.75 0 0 0 .75-.75v-8.5Z" />
      <path d="m10.15 17.35-2.8-2.8 1.4-1.4 1.4 1.38 4.9-4.88 1.4 1.4-6.3 6.3Z" />
    </svg>
  ),
};

const featureIcons = {
  course: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.75 3.5h10.5A2.75 2.75 0 0 1 19 6.25v14.25H7.25A3.25 3.25 0 0 1 4 17.25v-12A1.75 1.75 0 0 1 5.75 3.5Zm1.5 13A1.25 1.25 0 0 0 6 17.75c0 .69.56 1.25 1.25 1.25H17v-2.5H7.25Z" />
      <path d="M8 7h7v2H8V7Zm0 3.5h5v2H8v-2Z" />
    </svg>
  ),
  contract: processIcons.contract,
  price: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm1 14.75v1.5h-2v-1.47a5.1 5.1 0 0 1-2.8-1.18l1.08-1.68c.84.62 1.72.95 2.65.95.92 0 1.48-.34 1.48-.92 0-.64-.66-.87-1.96-1.23-1.54-.43-2.88-1.03-2.88-2.82 0-1.42.94-2.48 2.43-2.85V6h2v1.52c.92.17 1.72.52 2.4 1.04l-1.03 1.65a3.78 3.78 0 0 0-2.18-.78c-.82 0-1.28.31-1.28.83 0 .59.62.82 1.85 1.17 1.64.45 3 1.08 3 2.91 0 1.49-1.05 2.58-2.76 2.91Z" />
    </svg>
  ),
  trial: processIcons.trial,
  match: processIcons.match,
  verified: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.25 2.55 1.65 3.03-.14 1.26 2.76 2.55 1.64-.8 2.94.8 2.93-2.55 1.65-1.26 2.76-3.03-.14L12 21.75 9.45 20.1l-3.03.14-1.26-2.76-2.55-1.65.8-2.93-.8-2.94 2.55-1.64 1.26-2.76 3.03.14L12 2.25Zm-1.08 12.4 5.04-5.04-1.42-1.42-3.62 3.62-1.46-1.46-1.42 1.42 2.88 2.88Z" />
    </svg>
  ),
  calendar: processIcons.calendar,
  secure: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 10V7.75a6 6 0 0 1 12 0V10h.25A2.75 2.75 0 0 1 21 12.75v5.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25v-5.5A2.75 2.75 0 0 1 5.75 10H6Zm2 0h8V7.75a4 4 0 0 0-8 0V10Zm5 4.75a1 1 0 1 0-2 0v2.5h2v-2.5Z" />
    </svg>
  ),
};

const contactIcons = {
  email: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 5h14.5A2.75 2.75 0 0 1 22 7.75v8.5A2.75 2.75 0 0 1 19.25 19H4.75A2.75 2.75 0 0 1 2 16.25v-8.5A2.75 2.75 0 0 1 4.75 5Zm.18 2 7.07 5.15L19.07 7H4.93Zm15.07 1.9-7.41 5.4a1 1 0 0 1-1.18 0L4 8.9v7.35c0 .41.34.75.75.75h14.5a.75.75 0 0 0 .75-.75V8.9Z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.23.2 2.23.2v2.46h-1.25c-1.24 0-1.63.77-1.63 1.56v1.91h2.77l-.44 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a7.75 7.75 0 0 0-7.75 7.75v2.15A3.25 3.25 0 0 0 7.5 15.65h.75V9.8H6.3a5.75 5.75 0 0 1 11.4 0h-1.95v5.85h.55A4.35 4.35 0 0 1 12 19h-1.25v2H12a6.35 6.35 0 0 0 6.16-4.82 3.25 3.25 0 0 0 1.59-2.78v-2.15A7.75 7.75 0 0 0 12 2.5Z" />
      <path d="M8.75 10.25h2v5h-2v-5Zm4.5 0h2v5h-2v-5Z" />
    </svg>
  ),
};

function ProcessStackCard({ step, index, progress, total }) {
  const cardRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ["start end", "start start"],
  });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.18, 1]);
  const targetScale = 1 - (total - index) * 0.04;
  const scale = useTransform(progress, [index * 0.25, 1], [1, targetScale]);

  return (
    <div ref={cardRef} className={styles.processCardSticky}>
      <motion.article
        className={styles.processCard}
        style={{
          scale,
          top: `${index * 25}px`,
        }}
      >
        <div className={styles.processCardCopy}>
          <span className={styles.stepNumber}>Step {index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>
        <motion.div className={styles.processCardVisual} style={{ scale: imageScale }}>
          <div className={styles.processCardIcon}>{processIcons[step.icon]}</div>
        </motion.div>
      </motion.article>
    </div>
  );
}

export default function Homepage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredServiceTitle, setHoveredServiceTitle] = useState(null);
  const processRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: processRef,
    offset: ["start start", "end end"],
  });
  const processIntroY = useTransform(scrollYProgress, [0.22, 0.34], ["0%", "-115%"]);
  const navigate = useNavigate();
  const goToLogin = () => navigate("/login");

  return (
    <main className={styles.page}>
      <section className={styles.heroHeader}>
        <div className={styles.heroTop}>
          <Link to="/" className={styles.logo}>
            <img src={JenLogo} alt="JEN" className={styles.logoMark} />
            <span className={styles.logoText}>Academia</span>
          </Link>
          

          <div className={styles.actionGroup}>
            <SpecularButton
              size="sm"
              radius={999}
              tint="#1e3828"
              tintOpacity={1}
              textColor="#ffffff"
              lineColor="#ffffff"
              baseColor="#6f9a3a"
              intensity={1.2}
              shineSize={12}
              shineFade={38}
              thickness={1.1}
              speed={0.55}
              followMouse
              proximity={220}
              className={styles.navButton}
              onClick={goToLogin}
            >
              Login
            </SpecularButton>
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

        <div className={styles.heroSection}>
          <div className={styles.heroContent}>
         
            <h1 className={styles.heroTitle}>
              <FoldText
                text="Learn"
                splitBy="char"
                hinge="top"
                trigger="mount"
                duration={1.45}
                stagger={0.07}
                delay={0}
                ease="power3.out"
                perspective={800}
                creaseShading={0}
                fontSize="inherit"
                fontWeight="inherit"
                color="inherit"
              />
              <FoldText
                text="English."
                splitBy="char"
                hinge="top"
                trigger="mount"
                duration={1.45}
                stagger={0.07}
                delay={0.55}
                ease="power3.out"
                perspective={800}
                creaseShading={0}
                fontSize="inherit"
                fontWeight="inherit"
                color="inherit"
              />
              <FoldText
                text="Your Way."
                splitBy="char"
                hinge="top"
                trigger="mount"
                duration={1.45}
                stagger={0.07}
                delay={1.25}
                ease="power3.out"
                perspective={800}
                creaseShading={0}
                fontSize="inherit"
                fontWeight="inherit"
                color="inherit"
                className={styles.heroTitleAccent}
              />
            </h1>
            <p className={styles.heroDescription}>
              JEN Academia connects students with the right tutor, makes class booking easier, and keeps
              learning progress clear from the first lesson onward.
            </p>

            <div className={styles.heroActions}>
              <SpecularButton
                size="md"
                radius={999}
                tint="#1e3828"
                tintOpacity={1}
                textColor="#ffffff"
                lineColor="#ffffff"
                baseColor="#79a847"
                intensity={1.25}
                shineSize={12}
                shineFade={38}
                thickness={1.15}
                speed={0.55}
                followMouse
                proximity={260}
                className={styles.ctaButton}
                onClick={goToLogin}
              >
                Start learning
              </SpecularButton>
              <SpecularButton
                size="md"
                radius={999}
                tint="#ffffff"
                tintOpacity={0.86}
                textColor="#1e3828"
                lineColor="#7aa64a"
                baseColor="#1e3828"
                intensity={1.1}
                shineSize={10}
                shineFade={42}
                thickness={1}
                speed={0.5}
                followMouse
                proximity={240}
                className={styles.secondaryButton}
                onClick={goToLogin}
              >
                See how it works
              </SpecularButton>
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

            <div className={styles.heroStats}>
              {infoCards.map((card) => (
                <div className={styles.heroInfoCard} key={card.title}>
                  <span className={styles.heroInfoIcon}>{card.icon}</span>
                  <span className={styles.heroInfoCopy}>
                    <strong>{card.title}</strong>
                    <span>{card.description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.services}>
        <section className={styles.servicesIntro}>
          <div className={styles.introCopy}>
            <span>Our services</span>
            <h2><strong>English learning services built around your goals.</strong></h2>
            <p>
              Choose flexible lesson packages, try a short trial class, get matched with the right tutor, and manage every class with ease.
            </p>
          </div>
        </section>

        <section className={styles.featureGrid}>
          {features.map((feature) => (
            <article
              key={feature.title}
              className={`${styles.featureCard} ${feature.className || ""}`}
              onMouseEnter={() => setHoveredServiceTitle(feature.title)}
              onMouseLeave={() => setHoveredServiceTitle(null)}
            >
              <div className={styles.featureBackground} />
              <div className={styles.featureContent}>
                <div className={styles.featureHeading}>
                  <div className={styles.featureIcon}>{featureIcons[feature.icon]}</div>
                  <h3 className={styles.featureCardTitle} aria-label={feature.title}>
                    <span className={styles.featureTitleMeasure} aria-hidden="true">
                      {feature.title}
                    </span>
                    <span className={styles.featureTitleText} aria-hidden="true">
                      {hoveredServiceTitle === feature.title ? (
                        <TextType
                          key={feature.title}
                          text={feature.title}
                          as="span"
                          typingSpeed={62}
                          initialDelay={60}
                          loop={false}
                          showCursor
                          cursorCharacter="|"
                          cursorClassName={styles.featureTitleCursor}
                        />
                      ) : (
                        feature.title
                      )}
                    </span>
                  </h3>
                </div>
                <p className={styles.featureCardDescription}>{feature.description}</p>
              </div>
            </article>
          ))}
        </section>
      </div>

      <section className={styles.processSection} ref={processRef}>
        <motion.div
          className={styles.processIntro}
          style={{ y: processIntroY }}
        >
          <span>How it works</span>
          <h2>A simple 4-step process for every learner</h2>
        </motion.div>

        <div className={styles.processCards}>
          {processSteps.map((step, index) => (
            <ProcessStackCard
              key={step.title}
              step={step}
              index={index}
              progress={scrollYProgress}
              total={processSteps.length}
            />
          ))}
        </div>
      </section>

      <section className={styles.contactSection}>
        <div className={styles.contactShell}>
          <div className={styles.contactIntro}>
            <span>Contact</span>
            <h2>Let us help you plan your first class.</h2>
            <p>
              Tell us what you want to improve and we will guide you through trial classes,
              lesson packages, tutor matching, and account setup.
            </p>
          </div>

          <div className={styles.contactBody}>
            <form
              className={styles.contactForm}
              onSubmit={(event) => event.preventDefault()}
            >
              <label>
                <span>Name</span>
                <input type="text" name="name" autoComplete="name" />
              </label>
              <label>
                <span>Email</span>
                <input type="email" name="email" autoComplete="email" />
              </label>
              <label>
                <span>Message</span>
                <textarea name="message" rows="5" />
              </label>
              <button type="submit">Send message</button>
            </form>

            <aside className={styles.contactAside} aria-label="Contact options">
              <div className={styles.contactNote}>
                <strong>Quick response for new learners</strong>
                <p>
                  Ask about schedules, available packages, or which tutor fits your English goals.
                </p>
              </div>
              <div className={styles.contactMethods}>
                {contactMethods.map((method) => (
                  <a className={styles.contactMethod} href={method.href} key={method.label}>
                    <span className={styles.contactMethodIcon}>{contactIcons[method.icon]}</span>
                    <span>
                      <small>{method.label}</small>
                      <strong>{method.value}</strong>
                    </span>
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>
      
    </main>
  );
}
