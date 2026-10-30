
document.addEventListener("DOMContentLoaded", async () => {
    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) return;

    try {
        const response = await fetch("/partials/footer.html");

        if (!response.ok) {
            throw new Error("Footer could not be loaded");
        }

        footerContainer.innerHTML = await response.text();

    } catch (error) {
        console.error("Footer loading error:", error);
    }
});
