
document.addEventListener("DOMContentLoaded", async () => {
    const navbarContainer = document.getElementById("site-navbar");

    if (!navbarContainer) return;

    try {
        const navbarResponse = await fetch("/partials/navbar.html");

        if (!navbarResponse.ok) {
            throw new Error("Navbar could not be loaded");
        }

        navbarContainer.innerHTML = await navbarResponse.text();

        const navLinks = document.getElementById("navbar-links");

        const authResponse = await fetch("/api/auth/me", {
            credentials: "include"
        });

        let user = null;

        if (authResponse.ok) {
            const data = await authResponse.json();
            user = data.user || data;
        }

        if (!user || !user.role) {
            navLinks.innerHTML = `
                <a href="/">Home</a>
                <a href="/dashboard.html">Dashboard</a>
                <a href="/login.html">Login</a>
                <a href="/register.html" class="nav-register">Register</a>
            `;
            return;
        }

        if (user.role === "admin") {
            navLinks.innerHTML = `
                <a href="/">Home</a>
                <a href="/admin/index.html">Dashboard</a>
                <a href="/admin/books.html">Books</a>
                <a href="/admin/students.html">Students</a>
                <a href="/admin/issue-books.html">Issue Books</a>
                <a href="/admin/returns.html">Returns</a>
                <a href="/admin/fines.html">Fines</a>
                <a href="/admin/reports.html">Reports</a>
                <button id="logout-btn" class="btn btn-light" type="button">
                    Logout
                </button>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="/">Home</a>
                <a href="/dashboard.html">Dashboard</a>
                <a href="/books.html">Books</a>
                <a href="/issued-books.html">Issued Books</a>
                <a href="/history.html">History</a>
                <a href="/fines.html">Fines</a>
                <a href="/profile.html">Profile</a>
                <button id="logout-btn" class="btn btn-light" type="button">
                    Logout
                </button>
            `;
        }

        // Active navigation link
        const currentPath = window.location.pathname;

        navLinks.querySelectorAll("a").forEach(link => {
            const linkPath = new URL(link.href).pathname;

            if (linkPath === currentPath) {
                link.classList.add("active");
            }
        });

        // Logout
        const logoutButton = document.getElementById("logout-btn");

        if (logoutButton) {
            logoutButton.addEventListener("click", async () => {
                try {
                    const response = await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include"
                    });

                    if (response.ok) {
                        window.location.href = "/login.html";
                    } else {
                        alert("Logout failed. Please try again.");
                    }
                } catch (error) {
                    console.error("Logout error:", error);
                    alert("Unable to logout. Please try again.");
                }
            });
        }

    } catch (error) {
        console.error("Navbar error:", error);
        navbarContainer.innerHTML = "<p>Navbar could not be loaded.</p>";
    }
});
