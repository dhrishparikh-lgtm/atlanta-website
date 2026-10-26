
"use strict";

const SERVER_ID = "1538727238290251886";
const STATS_REFRESH_INTERVAL = 120000;

document.addEventListener("DOMContentLoaded", () => {
    initializeYear();
    initializeNavigation();
    initializeRevealAnimations();
    initializePageLoader();
    initializeDiscordStats();
});

function initializeYear() {
    const yearElement = document.getElementById("year");

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}

function initializeNavigation() {
    const menuToggle = document.getElementById("menuToggle");
    const nav = document.getElementById("nav");

    if (!menuToggle || !nav) return;

    const setMenuState = (isOpen) => {
        nav.classList.toggle("open", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation" : "Open navigation"
        );
    };

    menuToggle.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
        setMenuState(!isOpen);
    });

    nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setMenuState(false));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setMenuState(false);
        }
    });

    document.addEventListener("click", (event) => {
        if (
            !nav.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            setMenuState(false);
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 850) {
            setMenuState(false);
        }
    });
}

function initializePageLoader() {
    const loader = document.getElementById("pageLoader");

    if (!loader) return;

    let hidden = false;

    const hideLoader = () => {
        if (hidden) return;
        hidden = true;

        loader.style.opacity = "0";
        loader.style.visibility = "hidden";

        window.setTimeout(() => {
            loader.remove();
        }, 500);
    };

    if (document.readyState === "complete") {
        hideLoader();
    } else {
        window.addEventListener("load", hideLoader, { once: true });
    }

    window.setTimeout(hideLoader, 3000);
}

function initializeRevealAnimations() {
    const elements = document.querySelectorAll(".reveal");

    if (!elements.length) return;

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
        elements.forEach((element) => {
            element.classList.add("visible");
        });
        return;
    }

    const observer = new IntersectionObserver(
        (entries, currentObserver) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    currentObserver.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.12,
            rootMargin: "0px 0px -35px 0px"
        }
    );

    elements.forEach((element) => observer.observe(element));
}

function initializeDiscordStats() {
    const onlineElement = document.getElementById("onlineCount");
    const memberElement = document.getElementById("memberCount");
    const statusElement = document.getElementById("serverStatus");
    const messageElement = document.getElementById("statusMessage");
    const updatedElement = document.getElementById("lastUpdated");

    if (
        !onlineElement ||
        !memberElement ||
        !statusElement ||
        !messageElement ||
        !updatedElement
    ) {
        return;
    }

    let requestInProgress = false;

    async function updateDiscordStats() {
        if (requestInProgress) return;

        requestInProgress = true;

        try {
            const response = await fetch(
                `https://discord.com/api/guilds/${SERVER_ID}/widget.json`,
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error("Discord widget unavailable");
            }

            const data = await response.json();

            const onlineCount = Number(data.presence_count);

            onlineElement.textContent = Number.isFinite(onlineCount)
                ? onlineCount.toLocaleString()
                : "—";

            memberElement.textContent = "—";

            statusElement.textContent = "ONLINE";
            statusElement.style.color = "#36d982";

            messageElement.textContent =
                "Public Discord widget responding";

            updatedElement.textContent =
                "Last checked: " +
                new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                });
        } catch {
            onlineElement.textContent = "—";
            memberElement.textContent = "—";

            statusElement.textContent = "UNAVAILABLE";
            statusElement.style.color = "#e32636";

            messageElement.textContent =
                "Live statistics could not be loaded.";

            updatedElement.textContent =
                "Visit Discord for current server information.";
        } finally {
            requestInProgress = false;
        }
    }

    updateDiscordStats();
    window.setInterval(updateDiscordStats, STATS_REFRESH_INTERVAL);
}
