import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Install from "./components/Install";
import Stats from "./components/Stats";
import Providers from "./components/Providers";
import Features from "./components/Features";
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
        <Install />
        <Stats />
        <Providers />
        <Features />
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