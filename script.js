let courses = [];
let editingIndex = -1;

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  loadFromStorage();
  updateDisplay();

  document
    .getElementById("courseForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      addCourse();
    });
});

function addCourse() {
  const courseName = document.getElementById("courseName").value.trim();
  const credits = parseFloat(document.getElementById("credits").value);
  const gpa = parseFloat(document.getElementById("gpa").value);

  if (!courseName || !credits || gpa < 0 || gpa > 4) {
    alert(
      "Please fill all required fields with valid values. GPA should be between 0 and 4."
    );
    return;
  }

  const course = {
    name: courseName,
    credits: credits,
    gpa: gpa,
    gradePoints: credits * gpa,
  };

  if (editingIndex >= 0) {
    courses[editingIndex] = course;
    editingIndex = -1;
    document.getElementById("addCourseBtn").textContent = "➕ Add Course";
  } else {
    courses.push(course);
  }

  updateDisplay();
  saveToStorage();
  clearForm();
  document.getElementById("courseName").focus();
}

function clearForm() {
  document.getElementById("courseForm").reset();
  editingIndex = -1;
  document.getElementById("addCourseBtn").textContent = "➕ Add Course";
}

function editCourse(index) {
  editingIndex = index;
  const course = courses[index];

  document.getElementById("courseName").value = course.name;
  document.getElementById("credits").value = course.credits;
  document.getElementById("gpa").value = course.gpa;
  document.getElementById("addCourseBtn").textContent = "✏️ Update Course";

  document
    .querySelector(".add-course-section")
    .scrollIntoView({ behavior: "smooth" });
}

function deleteCourse(index) {
  if (confirm("Are you sure you want to delete this course?")) {
    courses.splice(index, 1);
    updateDisplay();
    saveToStorage();

    if (editingIndex === index) clearForm();
  }
}

function updateDisplay() {
  const tbody = document.getElementById("coursesTableBody");
  const emptyState = document.getElementById("emptyState");

  if (courses.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    document.getElementById("cgpaValue").textContent = "0.00";
    document.getElementById("totalCourses").textContent = "0";
    document.getElementById("totalCredits").textContent = "0";
    document.getElementById("avgGPA").textContent = "0.00";
    return;
  }

  emptyState.style.display = "none";

  let totalCredits = 0;
  let totalGradePoints = 0;

  courses.forEach((course) => {
    totalCredits += course.credits;
    totalGradePoints += course.gradePoints;
  });

  const cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  const avgGPA =
    courses.length > 0
      ? courses.reduce((sum, course) => sum + course.gpa, 0) / courses.length
      : 0;

  document.getElementById("cgpaValue").textContent = cgpa.toFixed(2);
  document.getElementById("totalCourses").textContent = courses.length;
  document.getElementById("totalCredits").textContent = totalCredits.toFixed(1);
  document.getElementById("avgGPA").textContent = avgGPA.toFixed(2);

  tbody.innerHTML = courses
    .map(
      (course, index) => `
      <tr>
        <td>${course.name}</td>
        <td>${course.credits}</td>
        <td>${course.gpa.toFixed(2)}</td>
        <td>${course.gradePoints.toFixed(2)}</td>
        <td class="actions">
          <button class="btn btn-secondary btn-small" onclick="editCourse(${index})">Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteCourse(${index})">Delete</button>
        </td>
      </tr>
    `
    )
    .join("");
}

function saveToStorage() {
  const data = {
    courses: courses,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem("cgpaData", JSON.stringify(data));
}

function loadFromStorage() {
  const saved = localStorage.getItem("cgpaData");
  if (saved) {
    const data = JSON.parse(saved);
    courses = data.courses || [];
  }
}

function saveCGPA() {
  const data = {
    courses: courses,
    timestamp: new Date().toISOString(),
    stats: {
      totalCourses: courses.length,
      totalCredits: courses.reduce((sum, course) => sum + course.credits, 0),
      cgpa: parseFloat(document.getElementById("cgpaValue").textContent),
      avgGPA: parseFloat(document.getElementById("avgGPA").textContent),
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cgpa_data_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadCGPA(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.courses && Array.isArray(data.courses)) {
        courses = data.courses;
        updateDisplay();
        saveToStorage();
        alert("Data loaded successfully!");
      } else {
        alert("Invalid file format. Please select a valid CGPA data file.");
      }
    } catch (error) {
      alert("Error loading file. Please check the file format.");
    }
  };
  reader.readAsText(file);
}

function showLoading() {
  document.getElementById("loading").style.display = "block";
}

function hideLoading() {
  document.getElementById("loading").style.display = "none";
}

async function exportToPDF() {
  if (courses.length === 0) {
    alert("No courses to export. Please add some courses first.");
    return;
  }

  showLoading();
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 10;

    doc.setFontSize(20);
    doc.text("CGPA Report", margin, 20);
    doc.setFontSize(12);
    doc.text(
      `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
      margin,
      30
    );

    doc.setFontSize(16);
    doc.text("Summary", margin, 50);
    doc.setFontSize(12);
    doc.text(
      `CGPA: ${document.getElementById("cgpaValue").textContent}`,
      margin,
      60
    );
    doc.text(
      `Total Courses: ${document.getElementById("totalCourses").textContent}`,
      margin,
      70
    );
    doc.text(
      `Total Credits: ${document.getElementById("totalCredits").textContent}`,
      margin,
      80
    );
    doc.text(
      `Average GPA: ${document.getElementById("avgGPA").textContent}`,
      margin,
      90
    );

    doc.setFontSize(16);
    doc.text("Course Details", margin, 110);

    let y = 125;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("Course Name", margin, y);
    doc.text("Credits", margin + 80, y);
    doc.text("GPA", margin + 120, y);
    doc.text("Grade Points", margin + 150, y);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += lineHeight;
    doc.setFont(undefined, "normal");

    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        doc.setFont(undefined, "bold");
        doc.text("Course Name", margin, y);
        doc.text("Credits", margin + 80, y);
        doc.text("GPA", margin + 120, y);
        doc.text("Grade Points", margin + 150, y);
        doc.line(margin, y + 2, pageWidth - margin, y + 2);
        y += lineHeight;
        doc.setFont(undefined, "normal");
      }

      const courseName =
        course.name.length > 25
          ? course.name.substring(0, 25) + "..."
          : course.name;
      doc.text(courseName, margin, y);
      doc.text(course.credits.toString(), margin + 80, y);
      doc.text(course.gpa.toFixed(2), margin + 120, y);
      doc.text(course.gradePoints.toFixed(2), margin + 150, y);
      y += lineHeight;
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 40, pageHeight - 10);
    }

    doc.save(`cgpa_report_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (error) {
    console.error("PDF generation error:", error);
    alert("Error generating PDF. Please try again.");
  } finally {
    hideLoading();
  }
}

async function exportToImage() {
  if (courses.length === 0) {
    alert("No courses to export. Please add some courses first.");
    return;
  }

  showLoading();
  try {
    const element = document.querySelector(".container");
    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    const link = document.createElement("a");
    link.download = `cgpa_report_${new Date().toISOString().split("T")[0]}.png`;
    link.href = canvas.toDataURL();
    link.click();
  } catch (error) {
    alert("Error generating image. Please try again.");
  } finally {
    hideLoading();
  }
}

function clearAll() {
  if (
    confirm("Are you sure you want to clear all data? This cannot be undone.")
  ) {
    courses = [];
    updateDisplay();
    saveToStorage();
    clearForm();
  }
}

// Keyboard shortcut: Ctrl + S to save
document.addEventListener("keydown", function (e) {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    saveCGPA();
  }
});
