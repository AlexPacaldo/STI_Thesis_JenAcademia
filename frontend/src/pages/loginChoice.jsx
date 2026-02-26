import styles from "../assets/loginChoice.module.css";



export default function loginChoice() {  

  return (
    <>
    <div className={styles.cont}>

      <section className={styles.Center}>
        <div className={styles.Title}>
          <h1>
            <b>Log in</b>
          </h1>
        </div>

        <div>
          <div>
            <div>
                <a href="/login" className={styles.submitbtnST}>
                  Student / Teacher
                </a>
                <a href="/" className={styles.submitbtn}>
                  Admin
                </a>
              
            </div>
          </div>
        </div>
      </section>
    </div>
    </>
  );
}
