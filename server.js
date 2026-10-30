require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 8080;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/lnct_library";

mongoose.set("strictQuery", true);

// ==================== MONGOOSE MODELS ====================

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    studentId: { type: String, trim: true, unique: true, sparse: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student"
    },
    course: { type: String, default: "MCA" },
    semester: { type: String, default: "2" },
    blocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    category: { type: String, default: "General" },
    isbn: { type: String, trim: true },
    publisher: { type: String, default: "" },
    year: { type: Number },
    quantity: { type: Number, default: 1, min: 0 },
    available: { type: Number, default: 1, min: 0 },
    rack: { type: String, default: "A-01" },
    description: { type: String, default: "" },
    cover: { type: String, default: "" }
  },
  { timestamps: true }
);

const issueSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["issued", "returned"],
      default: "issued"
    },
    fine: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Book = mongoose.model("Book", bookSchema);
const Issue = mongoose.model("Issue", issueSchema);

// ==================== MIDDLEWARE ====================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionOptions = {
  name: "lnct.sid",
  secret: process.env.SESSION_SECRET || "change-this-secret-in-env",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
};

// MongoDB session store
if (process.env.MONGODB_URI) {
  sessionOptions.store = MongoStore.create({
    mongoUrl: MONGODB_URI
  });
}

app.use(session(sessionOptions));

// IMPORTANT: HTML, CSS, JS and images are in the project root.
app.use(express.static(__dirname));

// ==================== AUTH MIDDLEWARE ====================

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in first."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (
    !req.session.user ||
    req.session.user.role !== "admin"
  ) {
    return res.status(403).json({
      message: "Admin access required."
    });
  }

  next();
}

function safeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    course: user.course,
    semester: user.semester
  };
}

// ==================== AUTHENTICATION API ====================

app.get("/api/auth/me", (req, res) => {
  res.json({
    user: req.session.user || null
  });
});

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      studentId,
      email,
      password,
      course,
      semester
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    const normalizedEmail = String(email)
      .toLowerCase()
      .trim();

    const conditions = [{ email: normalizedEmail }];

    if (studentId && String(studentId).trim()) {
      conditions.push({
        studentId: String(studentId).trim()
      });
    }

    const existing = await User.findOne({
      $or: conditions
    });

    if (existing) {
      return res.status(409).json({
        message: "Email or Student ID already exists."
      });
    }

    const passwordHash = await bcrypt.hash(
      String(password),
      12
    );

    const user = await User.create({
      name: String(name).trim(),
      studentId: studentId
        ? String(studentId).trim()
        : undefined,
      email: normalizedEmail,
      passwordHash,
      course: course || "MCA",
      semester: semester || "2",
      role: "student"
    });

    req.session.user = safeUser(user);

    res.status(201).json({
      message: "Registration successful.",
      user: req.session.user
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    res.status(500).json({
      message:
        error.code === 11000
          ? "Email or Student ID already exists."
          : "Could not register user."
    });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .toLowerCase()
      .trim();

    const password = String(req.body.password || "");

    const user = await User.findOne({ email });

    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (user.blocked) {
      return res.status(403).json({
        message: "Your account is blocked. Contact the library admin."
      });
    }

    req.session.user = safeUser(user);

    res.json({
      message: "Login successful.",
      user: req.session.user
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      message: "Could not log in."
    });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Could not log out."
      });
    }

    res.clearCookie("lnct.sid");

    res.json({
      message: "Logged out successfully."
    });
  });
});

// ==================== BOOKS API ====================

// Get books and search
app.get("/api/books", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();

    const filter = {};

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { author: { $regex: escaped, $options: "i" } },
        { isbn: { $regex: escaped, $options: "i" } }
      ];
    }

    if (category) {
      filter.category = category;
    }

    const books = await Book.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(books);
  } catch (error) {
    console.error("Books error:", error.message);

    res.status(500).json({
      message: "Could not load books."
    });
  }
});

// Add book (admin only)
app.post("/api/books", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      isbn,
      publisher,
      year,
      quantity,
      rack,
      description,
      cover
    } = req.body;

    if (!title || !author) {
      return res.status(400).json({
        message: "Title and author are required."
      });
    }

    const qty = Math.max(0, Number(quantity) || 0);

    const book = await Book.create({
      title,
      author,
      category,
      isbn: isbn || undefined,
      publisher,
      year,
      quantity: qty,
      available: qty,
      rack,
      description,
      cover
    });

    res.status(201).json(book);
  } catch (error) {
    console.error("Create book error:", error.message);

    res.status(500).json({
      message: "Could not create book."
    });
  }
});

// Update book (admin only)
app.patch("/api/books/:id", requireAdmin, async (req, res) => {
  try {
    const updates = { ...req.body };

    // Available copies must be changed through issue/return.
    delete updates.available;

    const book = await Book.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    res.json(book);
  } catch (error) {
    console.error("Update book error:", error.message);

    res.status(400).json({
      message: "Could not update book."
    });
  }
});

// Delete book (admin only)
app.delete("/api/books/:id", requireAdmin, async (req, res) => {
  try {
    const active = await Issue.exists({
      book: req.params.id,
      status: "issued"
    });

    if (active) {
      return res.status(409).json({
        message: "This book has active issues and cannot be deleted."
      });
    }

    const book = await Book.findByIdAndDelete(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    res.json({
      message: "Book deleted successfully."
    });
  } catch (error) {
    console.error("Delete book error:", error.message);

    res.status(400).json({
      message: "Could not delete book."
    });
  }
});

// ==================== STUDENTS API ====================

// List students (admin only)
app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({
      role: "student"
    })
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .limit(300);

    res.json(users);
  } catch (error) {
    console.error("Students error:", error.message);

    res.status(500).json({
      message: "Could not load students."
    });
  }
});

// Block or unblock a student (admin only)
app.patch("/api/users/:id/block", requireAdmin, async (req, res) => {
  try {
    const blocked =
      req.body.blocked === true ||
      req.body.blocked === "true";

    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: "student"
      },
      { blocked },
      { new: true }
    ).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        message: "Student not found."
      });
    }

    res.json(user);
  } catch (error) {
    console.error("Block student error:", error.message);

    res.status(400).json({
      message: "Could not update student."
    });
  }
});

// ==================== ISSUE / RETURN API ====================

// Get issue records
app.get("/api/issues", requireAuth, async (req, res) => {
  try {
    const filter =
      req.session.user.role === "admin"
        ? {}
        : { student: req.session.user.id };

    const issues = await Issue.find(filter)
      .populate("book", "title author category")
      .populate("student", "name studentId email")
      .sort({ createdAt: -1 })
      .limit(300);

    res.json(issues);
  } catch (error) {
    console.error("Issues error:", error.message);

    res.status(500).json({
      message: "Could not load issues."
    });
  }
});

// Issue book (admin only)
app.post("/api/issues", requireAdmin, async (req, res) => {
  try {
    const { bookId, studentId, dueDate } = req.body;

    if (
      !mongoose.isValidObjectId(bookId) ||
      !mongoose.isValidObjectId(studentId)
    ) {
      return res.status(400).json({
        message: "Valid book and student IDs are required."
      });
    }

    const [book, student] = await Promise.all([
      Book.findById(bookId),
      User.findById(studentId)
    ]);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    if (
      !student ||
      student.role !== "student" ||
      student.blocked
    ) {
      return res.status(400).json({
        message: "Valid active student required."
      });
    }

    if (book.available < 1) {
      return res.status(409).json({
        message: "No copies currently available."
      });
    }

    if (!dueDate) {
      return res.status(400).json({
        message: "Please select a due date."
      });
    }

    const due = new Date(`${dueDate}T23:59:59`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(due.getTime()) || due < today) {
      return res.status(400).json({
        message: "Due date cannot be in the past."
      });
    }

    const activeCount = await Issue.countDocuments({
      student: student._id,
      status: "issued"
    });

    if (activeCount >= 3) {
      return res.status(409).json({
        message: "Student already has 3 active books."
      });
    }

    const issue = await Issue.create({
      book: book._id,
      student: student._id,
      dueDate: due
    });

    book.available -= 1;
    await book.save();

    await issue.populate([
      { path: "book", select: "title author" },
      { path: "student", select: "name studentId" }
    ]);

    res.status(201).json(issue);
  } catch (error) {
    console.error("Issue book error:", error.message);

    res.status(500).json({
      message: "Could not issue book."
    });
  }
});

// Return book
app.post("/api/issues/:id/return", requireAuth, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate("book");

    if (!issue) {
      return res.status(404).json({
        message: "Issue record not found."
      });
    }

    const isAdmin = req.session.user.role === "admin";

    const issueStudentId = issue.student?._id
      ? String(issue.student._id)
      : String(issue.student);

    if (
      !isAdmin &&
      issueStudentId !== String(req.session.user.id)
    ) {
      return res.status(403).json({
        message: "You cannot return another student's book."
      });
    }

    if (issue.status === "returned") {
      return res.status(409).json({
        message: "This book is already returned."
      });
    }

    if (!issue.book) {
      return res.status(404).json({
        message: "Associated book not found."
      });
    }

    const now = new Date();

    const lateDays = Math.max(
      0,
      Math.ceil(
        (now - issue.dueDate) / (1000 * 60 * 60 * 24)
      )
    );

    issue.status = "returned";
    issue.returnDate = now;
    issue.fine = lateDays * 5;

    await issue.save();

    issue.book.available = Math.min(
      issue.book.quantity,
      issue.book.available + 1
    );

    await issue.book.save();

    res.json({
      message: "Book returned successfully.",
      fine: issue.fine,
      issue
    });
  } catch (error) {
    console.error("Return book error:", error.message);

    res.status(500).json({
      message: "Could not return book."
    });
  }
});

// ==================== DASHBOARD API ====================

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const isAdmin = req.session.user.role === "admin";

    const ownFilter = isAdmin
      ? {}
      : { student: req.session.user.id };

    const [
      totalBooks,
      availableBooks,
      totalStudents,
      activeIssues,
      overdueIssues,
      issueCount
    ] = await Promise.all([
      Book.countDocuments(),

      Book.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$available" }
          }
        }
      ]),

      User.countDocuments({ role: "student" }),

      Issue.countDocuments({
        ...ownFilter,
        status: "issued"
      }),

      Issue.countDocuments({
        ...ownFilter,
        status: "issued",
        dueDate: { $lt: new Date() }
      }),

      Issue.countDocuments(ownFilter)
    ]);

    res.json({
      totalBooks,
      availableCopies: availableBooks[0]?.total || 0,
      ...(isAdmin ? { totalStudents } : {}),
      activeIssues,
      overdueIssues,
      issueCount
    });
  } catch (error) {
    console.error("Dashboard error:", error.message);

    res.status(500).json({
      message: "Could not load dashboard."
    });
  }
});

// ==================== ADMIN SETUP ====================

async function ensureConfiguredAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "Admin setup skipped. Configure ADMIN_EMAIL and ADMIN_PASSWORD in .env."
    );
    return;
  }

  const normalizedEmail = String(email)
    .toLowerCase()
    .trim();

  const existing = await User.findOne({
    $or: [
      { role: "admin" },
      { email: normalizedEmail }
    ]
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);

    await User.create({
      name: process.env.ADMIN_NAME || "Library Admin",
      email: normalizedEmail,
      passwordHash,
      role: "admin"
    });

    console.log("Admin account created successfully.");
  } else if (existing.role !== "admin") {
    console.warn(
      "ADMIN_EMAIL belongs to a student. Choose another admin email."
    );
  }
}

// ==================== HTML PAGES ====================

// Home page: index.html must be in the project root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Login page: login.html must be in the project root
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Register page: register.html must be in the project root
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// Optional direct HTML URLs
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// ==================== 404 HANDLER ====================

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      message: "API endpoint not found."
    });
  }

  res.status(404).send("Page not found. Check the requested URL.");
});

// ==================== START SERVER ====================

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log("MongoDB connected successfully.");

    await ensureConfiguredAdmin();

    app.listen(PORT, () => {
      console.log(
        `LNCT Library running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);

    console.error(
      "Check MongoDB service or configure a valid MONGODB_URI in .env."
    );

    process.exitCode = 1;
  }
}

startServer();