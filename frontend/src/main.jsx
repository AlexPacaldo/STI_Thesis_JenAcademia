import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider} from "react-router-dom";
import App from "./App.jsx";
import { NotificationProvider } from "./components/NotificationContainer.jsx";
import Homepage from "./pages/homepage.jsx";
import Register from "./pages/register.jsx";
import Login from "./pages/login.jsx";
import Account from "./pages/account.jsx"
import "./index.css";



import LoginChoice from "./pages/loginChoice.jsx"

import AdminDashboard from "./pages/AdminDashboard.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AssignmentsDropbox from "./pages/assignmentsDropbox.jsx";
import Assignments from "./pages/assignments.jsx";
import Remarks from "./pages/remarks.jsx";
import BooksLessons from "./pages/booksLessons.jsx";
import BooksContent from "./pages/booksContent.jsx";

import PassRemarks from "./pages/PassRemarks.jsx";
import TeacherAssignment from "./pages/teacherAssignment.jsx";
import TeacherBooksLessons from "./pages/teacherBooksLessons.jsx";
import Calendar from "./pages/Calendar.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,                 // layout (Header/Footer)
    children: [
      { index: true, element: <Homepage /> },  // renders at "/"
      { path: "register", element: <Register /> },
      { path: "login", element: <Login /> },
      // { path: "loginChoice", element: <LoginChoice /> },
      
      // in your router
      

      { path: "AdminDashboard", element: <AdminDashboard /> },

      { path: "account", element: <Account /> },
      
      { path: "StudentDashboard", element: <Dashboard mode="student" /> },
      
      { path: "assignmentsDropbox", element: <AssignmentsDropbox /> },
      { path: "assignments", element: <Assignments /> },
      { path: "remarks", element: <Remarks /> },
      { path: "booksLessons", element: <BooksLessons /> },
      { path: "booksContent", element: <BooksContent /> },
      { path: "booksContent/:bookId", element: <BooksContent mode="student" /> },

      { path: "TeacherDashboard", element: <Dashboard mode="teacher" /> },
      {
        path: "Calendar",element: <Calendar/>},
      { path: "PassRemarks", element: <PassRemarks /> },
      { path: "teacherAssignment", element: <TeacherAssignment /> },
      { path: "TeacherBooksLessons", element: <TeacherBooksLessons /> },
      { path: "teacherBooksLessons/:bookId", element: <BooksContent mode="teacher" /> },


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
