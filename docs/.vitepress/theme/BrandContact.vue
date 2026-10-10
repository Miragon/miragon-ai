<!--
  Contact section ported from the marketing site
  (miragon-ai-website/src/components/ContactSection.tsx): Calendly inline
  widget + collapsible mail form. The form submits to Netlify Forms (AJAX
  POST, urlencoded) — it stays in the DOM via v-show so the prerendered
  HTML carries the data-netlify markup Netlify's form detection needs.
  Calendly loads client-side only (onMounted), keeping SSG builds clean.
  Colours come from the theme's CSS variables (custom.css → CI tokens) —
  the Calendly embed included, whose URL colours are read from the tokens
  at mount time.
-->
<template>
  <section id="contact" class="contact">
    <div class="left">
      <span class="label">Book a call</span>
      <h3 class="title">
        Let's talk about your<br />
        journey to process intelligence.
      </h3>
      <p class="desc">
        Pick a slot that works for you: 30 minutes, no agenda required. We'll talk through your
        current setup and where AI-native tooling can make a real difference.
      </p>

      <div class="divider" />

      <button class="mailToggle" :aria-expanded="mailOpen" @click="toggleMail">
        <span>Prefer to write instead?</span>
        <span class="chevron" :class="{ open: mailOpen }">⌄</span>
      </button>

      <div v-show="mailOpen" class="mailForm">
        <div v-if="sent" class="sentMsg">Thanks, we'll get back to you shortly.</div>
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

const CALENDLY_URL = "https://calendly.com/miragon-ai/miragon-ai-discovery-call"
// Calendly embed colours (6-digit hex, no "#") ← CI tokens, so the embed
// follows a token update without a second copy of the values here. The
// primary stays white: Calendly draws bookable dates in the primary on a tint
// of itself, which no CI accent clears at WCAG AA there (--cd-gruen 4.1:1,
// --cd-blau-hell 3.5:1).
const CALENDLY_COLORS = {
  background_color: "--cd-schwarz",
  text_color: "--cd-weiss",
  primary_color: "--cd-weiss",
} as const

function calendlyUrl(el: HTMLElement): string {
  const style = getComputedStyle(el)
  const params = new URLSearchParams()
  for (const [param, token] of Object.entries(CALENDLY_COLORS)) {
    const hex = style.getPropertyValue(token).trim().replace(/^#/, "")
    if (/^[0-9a-f]{6}$/i.test(hex)) params.set(param, hex.toLowerCase())
  }
  const query = params.toString()
  return query ? `${CALENDLY_URL}?${query}` : CALENDLY_URL
}

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
      Calendly.initInlineWidget({
        url: calendlyUrl(calendlyRef.value),
        parentElement: calendlyRef.value,
      })
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
  border-top: 1px solid var(--vp-c-divider);
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
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: var(--vp-c-brand-1);
}

.title {
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 20px;
  color: var(--vp-c-text-1);
}

.desc {
  font-size: 16px;
  line-height: 1.75;
  color: var(--vp-c-text-2);
  margin: 0 0 28px;
}

.divider {
  height: 1px;
  background: var(--vp-c-divider);
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
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.mailToggle:hover {
  color: var(--vp-c-brand-1);
}
.chevron {
  transition: transform var(--cd-motion-fast) var(--cd-ease);
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
  color: var(--vp-c-text-2);
}

.input {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-input-border-color);
  border-radius: var(--cd-radius-md);
  padding: 11px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--vp-c-text-1);
  outline: none;
  transition:
    border-color var(--cd-motion-fast) var(--cd-ease),
    background var(--cd-motion-fast) var(--cd-ease);
}
.input::placeholder {
  color: var(--vp-c-text-3);
}
/* Focus is blue that must stay blue on a dark ground: --cd-blau-hell
   (5.38:1 on --cd-schwarz); the border change alone is too faint a cue. */
.input:focus {
  border-color: var(--cd-blau-hell);
  background: var(--vp-c-bg-elv);
}
.input:focus-visible {
  outline: 2px solid var(--cd-blau-hell);
  outline-offset: 2px;
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
  border-radius: var(--cd-radius-pill);
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--cd-motion-fast) var(--cd-ease),
    transform var(--cd-motion-fast) var(--cd-ease);
}
.sendBtn:hover:not(:disabled) {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
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
  color: var(--vp-c-text-3);
}
.privacyNote a {
  color: var(--vp-c-text-2);
  text-decoration: underline;
}
.privacyNote a:hover {
  color: var(--vp-c-brand-1);
}

/* Status messages. The contact section sits on the always-dark landing, so
   they follow the CI's dark-ground rule: no tinted fill (the -soft tints are
   opaque light surfaces since tokens 1.8.0), white text, the edge in the
   status colour's -hell value. */
.sentMsg {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  padding: 12px 16px;
  border: 1px solid var(--cd-success-hell);
  border-radius: var(--cd-radius-md);
  background: transparent;
}

.errorMsg {
  margin: 0;
  font-size: 14px;
  color: var(--vp-c-text-1);
  padding: 12px 16px;
  border: 1px solid var(--cd-danger-hell);
  border-radius: var(--cd-radius-md);
  background: transparent;
}

.honeypot {
  position: absolute;
  left: -9999px;
  opacity: 0;
  pointer-events: none;
}

.calendlyWrap {
  position: relative;
  border: 1px solid var(--vp-c-border);
  border-radius: var(--cd-radius-lg);
  overflow: clip;
  background: var(--cd-schwarz);
}
/* Brand gradient across the top edge of the frame */
.calendlyWrap::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 1;
  background: var(--cd-gradient-brand);
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
  color: var(--vp-c-text-3);
}
</style>
