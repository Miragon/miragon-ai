<!--
  Contact section ported from the marketing site
  (miragon-ai-website/src/components/ContactSection.tsx): Calendly inline
  widget + collapsible mail form. The form submits to Netlify Forms (AJAX
  POST, urlencoded) — it stays in the DOM via v-show so the prerendered
  HTML carries the data-netlify markup Netlify's form detection needs.
  Calendly loads client-side only (onMounted), keeping SSG builds clean.
-->
<template>
  <section id="contact" class="contact">
    <div class="left">
      <span class="label">Book a call</span>
      <h3 class="title">
        Let's talk about your<br />
        journey to <span class="grad">process intelligence.</span>
      </h3>
      <p class="desc">
        Pick a slot that works for you — 30 minutes, no agenda required. We'll talk through your
        current setup and where AI-native tooling can make a real difference.
      </p>

      <div class="divider" />

      <button class="mailToggle" :aria-expanded="mailOpen" @click="toggleMail">
        <span>Prefer to write instead?</span>
        <span class="chevron" :class="{ open: mailOpen }">⌄</span>
      </button>

      <div v-show="mailOpen" class="mailForm">
        <div v-if="sent" class="sentMsg">✓ Thanks — we'll get back to you shortly.</div>
        <form
          v-show="!sent"
          ref="formRef"
          class="form"
          name="contact"
          method="POST"
          action="/"
          data-netlify="true"
          data-netlify-honeypot="bot-field"
          @submit.prevent="handleSend"
        >
          <input type="hidden" name="form-name" value="contact" />
          <p class="honeypot">
            <label
              >Don't fill this out: <input name="bot-field" tabindex="-1" autocomplete="off"
            /></label>
          </p>
          <div class="formRow">
            <div class="formField">
              <label class="fieldLabel" for="m-name">Name</label>
              <input
                id="m-name"
                v-model="name"
                name="name"
                type="text"
                class="input"
                placeholder="Jane Smith"
                :disabled="submitting"
                required
              />
            </div>
            <div class="formField">
              <label class="fieldLabel" for="m-email">Email</label>
              <input
                id="m-email"
                v-model="email"
                name="email"
                type="email"
                class="input"
                placeholder="jane@company.com"
                :disabled="submitting"
                required
              />
            </div>
          </div>
          <div class="formField">
            <label class="fieldLabel" for="m-msg">Message</label>
            <textarea
              id="m-msg"
              v-model="message"
              name="message"
              class="input textarea"
              placeholder="Tell us about your process automation challenges…"
              rows="4"
              :disabled="submitting"
              required
            />
          </div>
          <button
            type="submit"
            class="sendBtn"
            :disabled="submitting || !name.trim() || !email.trim() || !message.trim()"
          >
            {{ submitting ? "Sending…" : "Send message" }}
          </button>
          <p v-if="error" class="errorMsg" role="alert">{{ error }}</p>
          <p class="privacyNote">
            We only use your details to answer your enquiry. Submissions are processed by Netlify
            (USA). See our
            <a href="https://www.miragon.io/datenschutz/" target="_blank" rel="noopener noreferrer"
              >privacy policy</a
            >.
          </p>
        </form>
      </div>
    </div>

    <div class="right">
      <div class="calendlyWrap">
        <div ref="calendlyRef" class="calendlyFrame">
          <p v-if="!calendlyReady" class="calendlyLoading">Loading calendar…</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"

const CALENDLY_URL =
  "https://calendly.com/miragon-ai/miragon-ai-discovery-call?background_color=1a1a1a&text_color=ffffff&primary_color=00e676"

const mailOpen = ref(false)
const name = ref("")
const email = ref("")
const message = ref("")
const sent = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const calendlyReady = ref(false)
const formRef = ref<HTMLFormElement>()
const calendlyRef = ref<HTMLDivElement>()

function toggleMail() {
  mailOpen.value = !mailOpen.value
  sent.value = false
}

async function handleSend() {
  if (submitting.value || !formRef.value) return
  if (!formRef.value.checkValidity()) {
    formRef.value.reportValidity()
    return
  }
  submitting.value = true
  error.value = null
  try {
    const body = new URLSearchParams(
      new FormData(formRef.value) as unknown as Record<string, string>,
    ).toString()
    const res = await fetch(formRef.value.getAttribute("action") || "/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    sent.value = true
  } catch {
    error.value = "Something went wrong. Please try again or email us at hello@miragon.io."
  } finally {
    submitting.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined
let cancelled = false

function ensureScript() {
  if (document.querySelector('script[src*="calendly"]')) return
  const script = document.createElement("script")
  script.src = "https://assets.calendly.com/assets/external/widget.js"
  script.async = true
  document.body.appendChild(script)
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  let attempts = 0
  pollTimer = setInterval(() => {
    attempts++
    if (cancelled) return
    const Calendly = (window as unknown as { Calendly?: { initInlineWidget?: Function } }).Calendly
    if (Calendly?.initInlineWidget && calendlyRef.value && !calendlyReady.value) {
      clearInterval(pollTimer)
      calendlyReady.value = true
      Calendly.initInlineWidget({ url: CALENDLY_URL, parentElement: calendlyRef.value })
    } else if (attempts >= 40) {
      clearInterval(pollTimer)
    }
  }, 100)
}

onMounted(() => {
  ensureScript()
  startPolling()

  // The consentmanager CMP (loaded via head, see config.ts) autoblocks the
  // Calendly script until the visitor consents — retry once consent arrives
  // (same pattern as the marketing site's ContactSection).
  const cmp = (window as unknown as { __cmp?: Function }).__cmp
  if (typeof cmp === "function") {
    try {
      cmp("addEventListener", [
        "consent",
        () => {
          if (cancelled) return
          ensureScript()
          startPolling()
        },
        false,
      ])
    } catch {
      /* noop */
    }
  }
})

onBeforeUnmount(() => {
  cancelled = true
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.contact {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 48px;
  margin-top: 64px;
  padding-top: 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
@media (max-width: 900px) {
  .contact {
    grid-template-columns: 1fr;
  }
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #98989d;
  margin-bottom: 20px;
}
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: #00e676;
}

.title {
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 20px;
  color: #f5f5f7;
}

.grad {
  background: linear-gradient(135deg, #00e676 0%, #3d5af1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.desc {
  font-size: 16px;
  line-height: 1.75;
  color: #98989d;
  margin: 0 0 28px;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 20px;
}

.mailToggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  font-size: 14px;
  font-weight: 500;
  color: #f5f5f7;
  cursor: pointer;
}
.mailToggle:hover {
  color: #00e676;
}
.chevron {
  transition: transform 0.2s;
}
.chevron.open {
  transform: rotate(180deg);
}

.mailForm {
  margin-top: 20px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 640px) {
  .formRow {
    grid-template-columns: 1fr;
  }
}

.formField {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fieldLabel {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #98989d;
}

.input {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 11px 14px;
  font-size: 14px;
  font-family: inherit;
  color: #f5f5f7;
  outline: none;
  transition:
    border-color 0.2s,
    background 0.2s;
}
.input::placeholder {
  color: #6e6e73;
}
.input:focus {
  border-color: rgba(0, 230, 118, 0.5);
  background: rgba(255, 255, 255, 0.09);
}
.textarea {
  resize: vertical;
}

.sendBtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  margin-top: 4px;
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: #00e676;
  color: #000;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.sendBtn:hover:not(:disabled) {
  opacity: 0.88;
  transform: translateY(-1px);
}
.sendBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.privacyNote {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6e6e73;
}
.privacyNote a {
  color: #98989d;
  text-decoration: underline;
}
.privacyNote a:hover {
  color: #00e676;
}

.sentMsg {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #00e676;
  padding: 12px 16px;
  border: 1px solid rgba(0, 230, 118, 0.25);
  border-radius: 10px;
  background: rgba(0, 230, 118, 0.06);
}

.errorMsg {
  margin: 0;
  font-size: 14px;
  color: #ff6b6b;
}

.honeypot {
  position: absolute;
  left: -9999px;
  opacity: 0;
  pointer-events: none;
}

.calendlyWrap {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  overflow: clip;
  background: #0a0a0a;
}
/* Signature gradient hairline on top of the frame */
.calendlyWrap::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  z-index: 1;
  background: linear-gradient(90deg, transparent, #00e676 30%, #3d5af1 70%, transparent);
}

.calendlyFrame {
  height: 640px;
}

.calendlyLoading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  font-size: 13px;
  color: #6e6e73;
}
</style>
