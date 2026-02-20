# **Product Requirements Document (PRD)**

**Project Name:** TreakHigh Hybrid Self-Hosted Quiz Platform

**Version:** 1.0

**Status:** Build & Prototype Phase

## **1\. Executive Summary**

TreakHigh is a specialized "Hybrid Self-Hosted SaaS" quiz platform designed for educational institutions with constrained network infrastructure. It solves the critical problem of school network failures during high-stakes testing by decoupling the student interface from the backend logic. The platform runs locally on school servers (ensuring data sovereignty and speed) while offering the advanced psychometric analytics of a cloud SaaS via an autonomous client architecture.

## **2\. Problem Statement**

* **Network Fragility:** Traditional cloud-based quizzes fail when school internet bandwidth is saturated (e.g., 500 students starting a test at 8:00 AM), causing latency and lost answers.  
* **Device Constraints:** Student devices (Chromebooks, older tablets) struggle with heavy JavaScript frameworks, leading to poor battery life and UI lag.  
* **Data Sovereignty:** Schools require strict on-premise data storage to comply with privacy regulations, preventing the use of public cloud multi-tenant solutions.

## **3\. User Personas**

* **The Student:** Needs a distraction-free, zero-latency testing interface that works even if the Wi-Fi flickers.  
* **The Teacher:** Needs real-time visibility into class progress and the ability to deploy quizzes without technical friction.  
* **The School IT Admin:** Needs a "set it and forget it" deployment that self-heals, updates automatically, and runs on existing, modest hardware (8GB RAM servers).

## **4\. Functional Requirements**

### **4.1. Student Interface (Frontend)**

* **REQ-FE-01 (Offline Resilience):** The client MUST download quiz content in "bundles." Once a bundle is loaded, the student MUST be able to complete it without an active network connection.  
* **REQ-FE-02 (Telemetry Queueing):** Student interactions (answers, time spent) MUST be queued locally in the browser (IndexedDB/Memory) and transmitted via background Web Workers to prevent UI blocking.  
* **REQ-FE-03 (Performance):** The UI MUST achieve 60 FPS on low-end devices by avoiding heavy frameworks (Vanilla JS only) and using hardware-accelerated CSS.

### **4.2. Assessment Logic (Backend)**

* **REQ-BE-01 (Adaptive Routing):** The system MUST support Computerized Adaptive Testing (CAT). The next question bundle MUST be selected based on the student's performance in the previous bundle.  
* **REQ-BE-02 (Psychometric Analysis):** The backend MUST calculate mastery levels using the Rasch Model via custom script execution (JavaScript/Python).

### **4.3. Infrastructure & Security**

* **REQ-INF-01 (Self-Hosted):** The entire stack MUST be deployable via Docker Compose on a single on-premise server.  
* **REQ-SEC-01 (Data Integrity):** All telemetry payloads MUST be signed (HMAC-SHA256) to prevent students from spoofing grades.  
* **REQ-SEC-02 (Network Isolation):** The database MUST NOT be exposed to the public network; access is restricted to the internal backend network.

## **5\. Non-Functional Requirements**

* **Scalability:** Must support 1,000 concurrent students on a standard 4-vCPU / 8GB RAM server.  
* **Reliability:** The system MUST automatically restart failed services (Autoheal) and survive host reboots.  
* **Compliance:** Telemetry data MUST adhere to the xAPI (Experience API) standard.

## **6\. Success Metrics (KPIs)**

* **Latency:** \< 100ms response time for local API calls.  
* **Reliability:** 0% data loss during simulated network interruptions.  
* **Efficiency:** Database memory usage stays \< 80% during "class-start surge" (500 concurrent logins).