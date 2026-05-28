import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider} from "react-router-dom";
import App from "./App.jsx";
import { NotificationProvider } from "./components/NotificationContainer.jsx";
import "./index.css";

const Homepage = lazy(() => import("./pages/homepage.jsx"));
const Register = lazy(() => import("./pages/register.jsx"));
const Login = lazy(() => import("./pages/login.jsx"));
const Account = lazy(() => import("./pages/account.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const AssignmentsDropbox = lazy(() => import("./pages/assignmentsDropbox.jsx"));
const Assignments = lazy(() => import("./pages/assignments.jsx"));
const Remarks = lazy(() => import("./pages/remarks.jsx"));
const BooksLessons = lazy(() => import("./pages/booksLessons.jsx"));
const BooksContent = lazy(() => import("./pages/booksContent.jsx"));
const PassRemarks = lazy(() => import("./pages/PassRemarks.jsx"));
const TeacherAssignment = lazy(() => import("./pages/teacherAssignment.jsx"));
const TeacherBooksLessons = lazy(() => import("./pages/teacherBooksLessons.jsx"));
const Calendar = lazy(() => import("./pages/Calendar.jsx"));

function Page({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,                 // layout (Header/Footer)
    children: [
      { index: true, element: <Page><Homepage /></Page> },  // renders at "/"
      { path: "register", element: <Page><Register /></Page> },
      { path: "login", element: <Page><Login /></Page> },
      // { path: "loginChoice", element: <LoginChoice /> },
      
      // in your router
      

      { path: "AdminDashboard", element: <Page><AdminDashboard /></Page> },

      { path: "account", element: <Page><Account /></Page> },
      
      { path: "StudentDashboard", element: <Page><Dashboard mode="student" /></Page> },
      
      { path: "assignmentsDropbox", element: <Page><AssignmentsDropbox /></Page> },
      { path: "assignments", element: <Page><Assignments /></Page> },
      { path: "remarks", element: <Page><Remarks /></Page> },
      { path: "booksLessons", element: <Page><BooksLessons /></Page> },
      { path: "booksContent", element: <Page><BooksContent /></Page> },
      { path: "booksContent/:bookId", element: <Page><BooksContent mode="student" /></Page> },

      { path: "TeacherDashboard", element: <Page><Dashboard mode="teacher" /></Page> },
      {
        path: "Calendar",element: <Page><Calendar/></Page>},
      { path: "PassRemarks", element: <Page><PassRemarks /></Page> },
      { path: "teacherAssignment", element: <Page><TeacherAssignment /></Page> },
      { path: "TeacherBooksLessons", element: <Page><TeacherBooksLessons /></Page> },
      { path: "teacherBooksLessons/:bookId", element: <Page><BooksContent mode="teacher" /></Page> },


       // "/register"
      // add more pages here...
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <NotificationProvider>
      <RouterProvider router={router} />
    </NotificationProvider>
  </React.StrictMode>
);
