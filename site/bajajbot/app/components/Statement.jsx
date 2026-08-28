"use client";

import { motion, useReducedMotion } from "motion/react";

export default function Statement() {
  const reduce = useReducedMotion();

  return (
    <section
      aria-labelledby="statement"
      className="mx-auto max-w-6xl px-5 py-24 md:py-36"
    >
      <motion.h2
        id="statement"
        className="text-balance text-center text-[clamp(2.3rem,7.2vw,5.5rem)] font-semibold leading-[1.06] tracking-tight"
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 28 }}
        whileInView={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        from a <span className="text-mute">thinking</span> block
        <br />
        <span aria-hidden="true" className="text-ember">
          →{" "}
        </span>
        to code that ships
      </motion.h2>
      <motion.p
        className="mx-auto mt-7 max-w-[46ch] text-center text-[15px] leading-relaxed text-mute md:text-base"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      >
        one session. no dashboard, no tabs, no babysitting — every step
        diffed, saved and undoable.
      </motion.p>
    </section>
  );
}