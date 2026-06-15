# Monitoring Free Hosting (InfinityFree, ByetHost, iFastNet...)

This document explains how to bypass the anti-bot systems used by free hosting providers to accurately monitor your website's uptime.

## The Problem
Free hosting services within the **iFastNet** ecosystem (including **InfinityFree**, **ByetHost**, **ProFreeHost**, etc.) utilize an automated anti-bot firewall.

- When a request is made to your domain, the server intercepts it and returns a blank page with an **HTTP 200 OK** status.
- This page contains a Javascript snippet that forces the browser to decrypt an AES challenge, set a `__test=...` cookie, and then automatically redirect to the real website or the Suspension page.
- Automated uptime monitoring systems (like Uptimer) operate at the Network layer and **cannot execute Javascript**. Therefore, Uptimer will always get stuck on this 200 OK page. Whether your site is fully operational or suspended, Uptimer will see a 200 OK response and report it as **UP**.

Below are the 2 most effective methods to bypass this limitation.

---

## Method 1: Spoofing Googlebot (Recommended)

This is the best method because it allows you to monitor your actual homepage URL. These hosting providers have a "hidden rule" that allows Google's bots to bypass the firewall without solving the Javascript challenge, ensuring the sites can be indexed for SEO.

### Setup Steps
1. Add a new Monitor or edit an existing one.
2. **URL:** Enter your website's normal URL (e.g., `https://cp.ignito.site`)
3. Check **Advanced HTTP options**:
   - **Follow redirects:** UNCHECK this box.
   - **Expected Status Codes:** `200`
   - **Headers (JSON):** Enter exactly this Googlebot spoofing payload:
     ```json
     {
       "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"
     }
     ```
   - **Response Must Not Contain / Must Contain:** Leave completely empty.

### How it works
By spoofing Googlebot, if your website is running normally, the hosting provider will bypass the JS challenge and return the actual homepage content with a 200 OK -> Uptimer reports **UP**. 
If your website is suspended, the provider will return a 302 redirect code instead of the JS challenge -> This doesn't match the expected 200 code -> Uptimer immediately reports **DOWN**.

---

## Method 2: Monitoring robots.txt

The AES anti-bot system typically only protects HTML/PHP pages (`/`, `index.php`, etc.), but it will always bypass requests made directly to static files used by search engines, such as `/robots.txt`.

### Setup Steps
1. Add a new Monitor or edit an existing one.
2. **URL:** Enter your website's URL and append `/robots.txt` at the end (e.g., `https://cp.ignito.site/robots.txt`)
3. Check **Advanced HTTP options**:
   - **Follow redirects:** UNCHECK this box.
   - **Expected Status Codes:** `200, 404` (If you haven't created a robots.txt file, it will return a 404. You input 404 so Uptimer knows the site is still alive).
   - **Headers (JSON):** Leave empty.
   - **Response Must Not Contain / Must Contain:** Leave completely empty.

### How it works
If the website is normal, accessing `robots.txt` will return a 200 code (if the file exists) or a 404 code (if it doesn't) -> Uptimer reports **UP**. 
When the website is Suspended, the server intercepts all requests and returns a 302 redirect code pointing to the suspension page -> The 302 error is not in the allowed list (200, 404) -> Uptimer immediately reports **DOWN**.

---

> [!TIP]
> **Recommendation:** You should prioritize **Method 1**, because it monitors your actual homepage rather than an empty static file. This allows you to see the real response Latency from your homepage's code.
