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

import VideoCall from "./components/VideoCall.jsx"

import LoginChoice from "./pages/loginChoice.jsx"
import Reschedule from "./pages/reschedule.jsx";

import AdminDashboard from "./pages/AdminDashboard.jsx";

import StudentDashboard from "./pages/StudentDashboard.jsx";
import AssignmentsDropbox from "./pages/assignmentsDropbox.jsx";
import Assignments from "./pages/assignments.jsx";
import Remarks from "./pages/remarks.jsx";
import BooksLessons from "./pages/booksLessons.jsx";
import BooksContent from "./pages/booksContent.jsx";

import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import PassRemarks from "./pages/PassRemarks.jsx";
import TeacherAssignment from "./pages/teacherAssignment.jsx";
import TeacherBooksLessons from "./pages/teacherBooksLessons.jsx";
import TeacherBooksDropbox from "./pages/teacherBooksDropbox.jsx";
import Calendar from "./pages/Calendar.jsx";


// Optional: seed from backend/localStorage
const initialTeacherAvailability =
  JSON.parse(localStorage.getItem("teacherAvailability") || "{}");

async function saveTeacherAvailability(availObj) {
  // TODO: replace with your API call
  localStorage.setItem("teacherAvailability", JSON.stringify(availObj));
  // Notification will be called from the component using the hook
}


const availability = {
  "2025-11-05": "available",
  "2025-11-11": "available",
  "2025-11-18": "unavailable",
};

function saveBooking(date, slot) {
  console.log("BOOK:", date, slot);
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,                 // layout (Header/Footer)
    children: [
      { index: true, element: <Homepage /> },  // renders at "/"
      { path: "register", element: <Register /> },
      { path: "login", element: <Login /> },
      // { path: "loginChoice", element: <LoginChoice /> },
      { path: "reschedule/:classId", element: <Reschedule /> },
      
      // in your router
      { path: "/call/:classId", element: <VideoCall /> },

      { path: "AdminDashboard", element: <AdminDashboard /> },

      { path: "account", element: <Account /> },
      
      { path: "StudentDashboard", element: <StudentDashboard /> },
      
      { path: "assignmentsDropbox", element: <AssignmentsDropbox /> },
      { path: "assignments", element: <Assignments /> },
      { path: "remarks", element: <Remarks /> },
      { path: "booksLessons", element: <BooksLessons /> },
      { path: "booksContent", element: <BooksContent /> },

      { path: "TeacherDashboard", element: <TeacherDashboard /> },
      {
        path: "Calendar",element: <Calendar/>},
      { path: "PassRemarks", element: <PassRemarks /> },
      { path: "teacherAssignment", element: <TeacherAssignment /> },
      { path: "TeacherBooksLessons", element: <TeacherBooksLessons /> },
      { path: "TeacherBooksDropbox", element: <TeacherBooksDropbox /> },


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
