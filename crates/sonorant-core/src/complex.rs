//! A minimal complex number, used only by the formant root-finder. Kept in
//! `f64` because Durand-Kerner at LPC order 24 overflows in single precision.
//! In-house rather than a dependency: the core stays small and auditable (TDD §5).

use core::ops::{Add, Div, Mul, Sub};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Complex {
    pub re: f64,
    pub im: f64,
}

impl Complex {
    pub const fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    pub const ZERO: Complex = Complex::new(0.0, 0.0);
    pub const ONE: Complex = Complex::new(1.0, 0.0);

    pub fn norm(self) -> f64 {
        (self.re * self.re + self.im * self.im).sqrt()
    }
}

impl Add for Complex {
    type Output = Complex;
    fn add(self, o: Complex) -> Complex {
        Complex::new(self.re + o.re, self.im + o.im)
    }
}

impl Sub for Complex {
    type Output = Complex;
    fn sub(self, o: Complex) -> Complex {
        Complex::new(self.re - o.re, self.im - o.im)
    }
}

impl Mul for Complex {
    type Output = Complex;
    fn mul(self, o: Complex) -> Complex {
        Complex::new(
            self.re * o.re - self.im * o.im,
            self.re * o.im + self.im * o.re,
        )
    }
}

impl Div for Complex {
    type Output = Complex;
    fn div(self, o: Complex) -> Complex {
        let d = o.re * o.re + o.im * o.im;
        Complex::new(
            (self.re * o.re + self.im * o.im) / d,
            (self.im * o.re - self.re * o.im) / d,
        )
    }
}
