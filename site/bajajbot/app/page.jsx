import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Install from "./components/Install";
import Stats from "./components/Stats";
import Providers from "./components/Providers";
import Features from "./components/Features";
import Statement from "./components/Statement";
import Pillars from "./components/Pillars";
import CheatSheet from "./components/CheatSheet";
import Testimonials from "./components/Testimonials";
import StartCta from "./components/StartCta";
import ThemeSwitcher from "./components/ThemeSwitcher";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Install />
        <Stats />
        <Providers />
        <Features />
        <Statement />
        <Pillars />
        <CheatSheet />
        <Testimonials />
        <StartCta />
      </main>
      <Footer />
      <ThemeSwitcher />
    </>
  );
}