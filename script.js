let courses = [];
let editingIndex = -1;
let autoFilledIndex = -1;

document.addEventListener("DOMContentLoaded", function () {
  loadFromStorage();
  updateDisplay();
  populateDatalist();

  const courseNameEl = document.getElementById("courseName");
  const retakeCheckbox = document.getElementById("retake");
  const retakeSection = document.getElementById("retakeSection");

  courseNameEl.addEventListener("blur", function () {
    checkAndAutoFill();
  });

  courseNameEl.addEventListener("change", function () {
    checkAndAutoFill();
  });

  retakeCheckbox.addEventListener("change", function () {
    if (this.checked) {
      retakeSection.classList.add("active");
    } else {
      retakeSection.classList.remove("active");
      document.getElementById("previousGpa").value = "";
    }
  });

  document.getElementById("courseForm").addEventListener("submit", function (e) {
    e.preventDefault();
    addCourse();
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveCGPA();
    }
  });
});

function checkAndAutoFill() {
  const courseNameEl = document.getElementById("courseName");
  const name = courseNameEl.value.trim();
  const alertEl = document.getElementById("autoFillAlert");

  if (!name) {
    alertEl.classList.remove("active");
    autoFilledIndex = -1;
    return;
  }

  const idx = findCourseByName(name);
  if (idx >= 0) {
    const course = courses[idx];
    document.getElementById("credits").value = String(course.credits);
    document.getElementById("gpa").value = "";
    document.getElementById("retake").checked = true;

    const highestGpa = getHighestGpaForCourse(name);
    document.getElementById("previousGpa").value = String(highestGpa);
    document.getElementById("retakeSection").classList.add("active");
    alertEl.classList.add("active");
    autoFilledIndex = idx;

    document.getElementById("gpa").focus();
  } else {
    alertEl.classList.remove("active");
    autoFilledIndex = -1;
  }
}

function getHighestGpaForCourse(courseName) {
  const n = String(courseName || "").toLowerCase();
  const matching = courses.filter(c => String(c.name || "").toLowerCase() === n);
  if (matching.length === 0) return 0;
  return Math.max(...matching.map(c => Number(c.gpa) || 0));
}

function findCourseByName(name) {
  const n = String(name || "").toLowerCase();
  return courses.findIndex(c => String(c.name || "").toLowerCase() === n);
}

function addCourse() {
  const courseNameEl = document.getElementById("courseName");
  const creditsEl = document.getElementById("credits");
  const gpaEl = document.getElementById("gpa");
  const retakeEl = document.getElementById("retake");
  const previousGpaEl = document.getElementById("previousGpa");

  const courseName = courseNameEl.value.trim();
  const credits = parseFloat(creditsEl.value);
  const gpa = parseFloat(gpaEl.value);
  const retake = !!retakeEl.checked;
  const prevGpaRaw = previousGpaEl.value;
  const previousGpa = prevGpaRaw === "" ? null : parseFloat(prevGpaRaw);

  if (!courseName) { alert("Please enter a course name."); courseNameEl.focus(); return; }
  if (isNaN(credits) || credits <= 0) { alert("Please enter valid credits (greater than 0)."); creditsEl.focus(); return; }
  if (isNaN(gpa) || gpa < 0 || gpa > 4) { alert("Please enter a valid GPA between 0 and 4."); gpaEl.focus(); return; }
  if (retake && previousGpa !== null && (isNaN(previousGpa) || previousGpa < 0 || previousGpa > 4)) { alert("Please enter a valid previous GPA between 0 and 4 for retake."); previousGpaEl.focus(); return; }

  const gradePoints = credits * gpa;
  const course = { name: courseName, credits: credits, gpa: gpa, gradePoints: gradePoints, retake: retake, previousGpa: previousGpa };

  if (editingIndex >= 0) {
    courses[editingIndex] = course;
    editingIndex = -1;
    document.getElementById("addCourseBtn").textContent = "➕ Add Course";
  } else {
    courses.push(course);
  }

  updateDisplay(true);
  saveToStorage();
  clearForm();
  populateDatalist();
  courseNameEl.focus();
}

function clearForm() {
  document.getElementById("courseForm").reset();
  document.getElementById("retakeSection").classList.remove("active");
  document.getElementById("autoFillAlert").classList.remove("active");
  editingIndex = -1;
  autoFilledIndex = -1;
  document.getElementById("addCourseBtn").textContent = "➕ Add Course";
}

function editCourse(index) {
  if (index < 0 || index >= courses.length) return;
  editingIndex = index;
  const course = courses[index];
  document.getElementById("courseName").value = course.name;
  document.getElementById("credits").value = String(course.credits);
  document.getElementById("gpa").value = String(course.gpa);
  document.getElementById("retake").checked = !!course.retake;
  document.getElementById("previousGpa").value = course.previousGpa !== null && course.previousGpa !== undefined ? String(course.previousGpa) : "";

  if (course.retake) {
    document.getElementById("retakeSection").classList.add("active");
  }

  document.getElementById("addCourseBtn").textContent = "✏️ Update Course";
  document.querySelector(".add-course-section").scrollIntoView({ behavior: "smooth" });
}

function deleteCourse(index) {
  if (!confirm("Are you sure you want to delete this course attempt?")) return;
  courses.splice(index, 1);
  updateDisplay();
  saveToStorage();
  if (editingIndex === index) clearForm();
  populateDatalist();
}

function processCoursesForCalculation() {
  const map = new Map();
  courses.forEach((c, idx) => {
    const key = String(c.name || "").toLowerCase();
    if (!map.has(key)) map.set(key, { entries: [] });
    map.get(key).entries.push({ idx, item: c });
  });

  const chosen = new Set();
  const processedRows = [];

  map.forEach((v, key) => {
    const entries = v.entries;
    let chosenEntry = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].item.retake) { chosenEntry = entries[i]; break; }
    }
    if (!chosenEntry) chosenEntry = entries[entries.length - 1];
    chosen.add(chosenEntry.idx);

    entries.forEach(e => {
      processedRows.push({
        index: e.idx,
        course: e.item,
        counted: chosen.has(e.idx)
      });
    });
  });

  processedRows.sort((a, b) => a.index - b.index);
  return { countedIndices: chosen, processedRows };
}

function updateDisplay(markNew = false) {
  const tableBody = document.getElementById("tableBody");
  const emptyState = document.getElementById("emptyState");

  if (!courses || courses.length === 0) {
    tableBody.innerHTML = "";
    emptyState.style.display = "block";
    document.getElementById("cgpaValue").textContent = "0.00";
    document.getElementById("totalCourses").textContent = "0";
    document.getElementById("totalCredits").textContent = "0";
    document.getElementById("avgGPA").textContent = "0.00";
    populateDatalist();
    return;
  }

  emptyState.style.display = "none";

  const { countedIndices, processedRows } = processCoursesForCalculation();

  let totalCredits = 0;
  let totalGradePoints = 0;
  let gpaSum = 0;
  let gpaCount = 0;

  courses.forEach((course, idx) => {
    if (countedIndices.has(idx)) {
      totalCredits += Number(course.credits) || 0;
      totalGradePoints += Number(course.gradePoints) || ((Number(course.credits) || 0) * (Number(course.gpa) || 0));
    }
    gpaSum += Number(course.gpa) || 0;
    gpaCount++;
  });

  const cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  const avgGPA = gpaCount > 0 ? (gpaSum / gpaCount) : 0;

  document.getElementById("cgpaValue").textContent = cgpa.toFixed(2);
  document.getElementById("totalCourses").textContent = String(courses.length);
  document.getElementById("totalCredits").textContent = totalCredits.toFixed(1);
  document.getElementById("avgGPA").textContent = avgGPA.toFixed(2);

  tableBody.innerHTML = processedRows.map((row) => {
    const course = row.course;
    const counted = row.counted;
    const nameSafe = escapeHtml(String(course.name));
    const creditsSafe = (Number(course.credits) || 0).toFixed(1);
    const gpaSafe = (Number(course.gpa) || 0).toFixed(2);
    const gpSafe = (Number(course.gradePoints) || ((Number(course.credits) || 0) * (Number(course.gpa) || 0))).toFixed(2);
    const retakeLabel = course.retake ? `<span class="badge">Yes</span><div class="muted" style="margin-top:4px;">Prev: ${course.previousGpa !== null && course.previousGpa !== undefined ? Number(course.previousGpa).toFixed(2) : '—'}</div>` : `<span class="badge">No</span>`;
    const excludedNote = counted ? '' : `<div class="muted" style="margin-top:6px;">(Excluded)</div>`;

    return `<tr class="${counted ? '' : 'row-excluded'}" data-row-index="${row.index}">
            <td>${nameSafe}${excludedNote}</td>
            <td>${creditsSafe}</td>
            <td>${gpaSafe}</td>
            <td>${gpSafe}</td>
            <td>${retakeLabel}</td>
            <td class="actions">
              <button class="btn btn-action btn-small" onclick="editCourse(${row.index})">Edit</button>
              <button class="btn btn-danger btn-small" onclick="deleteCourse(${row.index})">Delete</button>
            </td>
        </tr>`;
  }).join("");

  populateDatalist();
}

function populateDatalist() {
  const dl = document.getElementById("courseList");
  if (!dl) return;
  const unique = Array.from(new Set(courses.map(c => String(c.name || "")))).filter(Boolean).sort((a, b) => a.localeCompare(b));
  dl.innerHTML = unique.map(n => `<option value="${escapeHtml(n)}"></option>`).join("");
}

function saveToStorage() {
  const data = { courses: courses, timestamp: new Date().toISOString() };
  try { localStorage.setItem("cgpaData", JSON.stringify(data)); } catch (e) { console.warn("Could not save to localStorage:", e); }
}

function loadFromStorage() {
  const saved = localStorage.getItem("cgpaData");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      courses = Array.isArray(data.courses) ? data.courses : [];
    } catch (e) { courses = []; }
  } else { courses = []; }
}

function saveCGPA() {
  if (!courses || courses.length === 0) { alert("No data to save."); return; }
  const data = {
    courses: courses,
    timestamp: new Date().toISOString(),
    stats: {
      totalCourses: courses.length,
      totalCredits: courses.reduce((sum, course) => sum + (Number(course.credits) || 0), 0),
      cgpa: parseFloat(document.getElementById("cgpaValue").textContent) || 0,
      avgGPA: parseFloat(document.getElementById("avgGPA").textContent) || 0,
    },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cgpa_data_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadCGPA(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const txt = e.target.result;
      const data = JSON.parse(txt);
      if (data.courses && Array.isArray(data.courses)) {
        courses = data.courses.map(c => ({
          name: String(c.name || ""),
          credits: Number(c.credits) || 0,
          gpa: Number(c.gpa) || 0,
          gradePoints: Number(c.gradePoints) || ((Number(c.credits) || 0) * (Number(c.gpa) || 0)),
          retake: !!c.retake,
          previousGpa: c.previousGpa !== undefined ? (c.previousGpa === null ? null : Number(c.previousGpa)) : null
        }));
        updateDisplay();
        saveToStorage();
        populateDatalist();
        alert("Data loaded successfully!");
      } else {
        alert("Invalid file format. Please select a valid CGPA data file.");
      }
    } catch (error) {
      alert("Error loading file. Please check the file format.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function showLoading() { document.getElementById("loading").style.display = "block"; }
function hideLoading() { document.getElementById("loading").style.display = "none"; }

async function exportToPDF() {
  if (!courses || courses.length === 0) { alert("No courses to export. Please add some courses first."); return; }
  showLoading();
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 16;

    doc.setFontSize(18); doc.setTextColor(40);
    doc.text("CGPA Report", margin, 60);
    doc.setFontSize(10); doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 80);

    doc.setFontSize(12);
    doc.text(`CGPA: ${document.getElementById("cgpaValue").textContent}`, margin, 110);
    doc.text(`Total Courses: ${document.getElementById("totalCourses").textContent}`, margin + 140, 110);
    doc.text(`Total Credits: ${document.getElementById("totalCredits").textContent}`, margin + 300, 110);

    let y = 140;
    doc.setFontSize(10); doc.setFont(undefined, "bold");
    doc.text("Course Name", margin, y);
    doc.text("Credits", margin + 240, y);
    doc.text("GPA", margin + 310, y);
    doc.text("Grade Points", margin + 360, y);
    doc.text("Retake", margin + 450, y);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);
    y += lineHeight;
    doc.setFont(undefined, "normal");

    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (y > pageHeight - margin - 40) { doc.addPage(); y = margin + 40; }
      const name = String(c.name || "");
      const clipped = name.length > 40 ? name.substring(0, 37) + "..." : name;
      doc.text(clipped, margin, y);
      doc.text(String(Number(c.credits).toFixed(1)), margin + 240, y);
      doc.text(String(Number(c.gpa).toFixed(2)), margin + 310, y);
      doc.text(String(Number(c.gradePoints || (c.credits * c.gpa)).toFixed(2)), margin + 360, y);
      doc.text(c.retake ? "Yes" : "No", margin + 450, y);
      y += lineHeight;
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 60, pageHeight - 20);
    }

    doc.save(`cgpa_report_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Error generating PDF. Please try again.");
  } finally { hideLoading(); }
}

async function exportToImage() {
  if (!courses || courses.length === 0) { alert("No courses to export. Please add some courses first."); return; }
  showLoading();
  try {
    const element = document.getElementById("appContainer");
    const canvas = await html2canvas(element, { backgroundColor: null, scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `cgpa_report_${new Date().toISOString().split("T")[0]}.png`;
    link.href = canvas.toDataURL();
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error(error);
    alert("Error generating image. Please try again.");
  } finally { hideLoading(); }
}

function clearAll() {
  if (confirm("Are you sure you want to clear all data? This cannot be undone.")) {
    courses = [];
    updateDisplay();
    saveToStorage();
    clearForm();
    populateDatalist();
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}