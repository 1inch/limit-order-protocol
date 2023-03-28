module.exports = {
    configureYulOptimizer: true,
    solcOptimizerDetails: {
        yul: true,
        yulDetails: {
            optimizerSteps:
                "dhfoDgvlfnTUtnIf" +               // None of these can make stack problems worse
                "[" +
                    "xa[r]EscLM" +                 // Turn into SSA and simplify
                    "cCTUtTOntnfDIl" +             // Perform structural simplification
                    "Lcl" +                        // Simplify again
                    "Vcl [j]" +                    // Reverse SSA

                    // should have good "compilability" property here.

                    "Tpel" +                       // Run functional expression inliner
                    "xa[rl]" +                     // Prune a bit more in SSA
                    "xa[r]cL" +                    // Turn into SSA again and simplify
                    "gvf" +                        // Run full inliner
                    "CTUca[r]LSsTFOtfDnca[r]Ilc" + // SSA plus simplify
                "]" +
                "jml[jl] VcTOcl jml",
        },
    },
    skipFiles: ['mocks', 'tests', 'interfaces'],
}
