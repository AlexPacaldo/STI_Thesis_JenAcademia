// src/pages/Homepage.jsx
import {Link, useLocation} from "react-router-dom";
import styles from "../assets/homepage.module.css";
// images (adjust paths if your files live elsewhere)
import Welcome  from "../assets/img/homepage/welcome.jpg";
import SignUp   from "../assets/img/homepage/signup.png";
import Match    from "../assets/img/homepage/match.png";
import Learning from "../assets/img/homepage/learning.png";

import Pic1 from "../assets/img/homepage/pic1.jpg";
import Pic2 from "../assets/img/homepage/pic2.jpg";
import Pic3 from "../assets/img/homepage/pic3.jpg";
import Pic4 from "../assets/img/homepage/pic4.jpg";
import Pic5 from "../assets/img/homepage/pic5.jpg";
import Pic6 from "../assets/img/homepage/pic6.jpg";
import Pic7 from "../assets/img/homepage/pic7.jpg";
import Pic8 from "../assets/img/homepage/pic8.jpg";

export default function Homepage() {
  return (
    <main>
      <div className={styles.center}>
        <div className={styles.WelcomeIntro}>
          <h1>
            <b>Personalized Online Tutoring <br /> for Every Student!</b>
          </h1>
          <p>Learn smarter, achieve better with JEN Academia.</p>
          <a href="/login" className={styles.btn}>Start Learning!</a>
        </div>

        <div className={styles.WelcomeDescrip}>
          <img src={Welcome} alt="Welcome" />
        </div>
      </div>

      <section className={styles.HowItWorks}>
        <div className={styles.StepIntro}>
          <h1>How It Works</h1>
          <h4>A simple 3-step process.</h4>
        </div>

        <div className={styles.Steps}>
          <div className={styles.step}>
            <img src={SignUp} alt="Sign Up Logo" />
            <div className={styles.stepContent}>
              <span className={styles.stepTitle}><b>Login</b></span>
              <span className={styles.stepDesc}>Login to your profile</span>
            </div>
          </div>

          <div className={styles.step}>
            <img src={Match} alt="Match Tutor Logo" />
            <div className={styles.stepContent}>
              <span className={styles.stepTitle}><b>Match with Tutor</b></span>
              <span className={styles.stepDesc}>Find your best fit</span>
            </div>
          </div>

          <div className={styles.step}>
            <img src={Learning} alt="Start Learning Logo" />
            <div className={styles.stepContent}>
              <span className={styles.stepTitle}><b>Start Learning</b></span>
              <span className={styles.stepDesc}>Begin your journey!</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.OurServices}>
        <div className={styles.Services}>
          <span className={styles.servicesTitle}><b>Our services</b></span>
          <span className={styles.servicesDesc}>Explore the wealth of knowledge we offer.</span>
          <a href="/login" className={styles.btn}>Start Learning!</a>
        </div>
      </section>

      <section className={styles.ListOfServices}>
        <div className={styles.ServicesList}>
          <img src={Pic1} alt="Online English Courses" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Online English Courses</b></span>
            <span className={styles.ListServicesDescription}>
              Covers Business English, IELTS preparation, Conversational English, Travel English, OPIc (for Korean students), TOEIC, and Online English News Discussions.
            </span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic2} alt="Class Contracts" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Class Contracts</b></span>
            <span className={styles.ListServicesDescription}>
              10, 15, or 20 classes, either 25 minutes or 1 hour.
            </span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic3} alt="Class Contracts" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Class Contracts</b></span>
            <span className={styles.ListServicesDescription}>
              10, 15, or 20 classes, either 25 minutes or 1 hour.
            </span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic4} alt="Trial Classes" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Trial Classes</b></span>
            <span className={styles.ListServicesDescription}>
              A free 10-minute trial class to assess the student’s level and preferences before enrollment.
            </span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic5} alt="AI-Based Teacher Matching" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>AI-Based Teacher Matching</b></span>
            <span className={styles.ListServicesDescription}>Personalized teacher–student pairing</span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic6} alt="Teacher Feedback & Progress Tracking" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Teacher Feedback & Progress Tracking</b></span>
            <span className={styles.ListServicesDescription}>Notes, corrections, and reports after each class</span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic7} alt="Flexible Class Scheduling" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Flexible Class Scheduling</b></span>
            <span className={styles.ListServicesDescription}>
              Students can book, cancel, or reschedule classes via an integrated calendar.
            </span>
          </div>
        </div>

        <div className={styles.ServicesList}>
          <img src={Pic8} alt="Secure & Reliable Learning System" />
          <div className={styles.textContent}>
            <span className={styles.ListServicesTitle}><b>Secure & Reliable Learning System</b></span>
            <span className={styles.ListServicesDescription}>
              All classes, schedules, and materials are protected with secure access, ensuring a safe and uninterrupted online learning experience.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
