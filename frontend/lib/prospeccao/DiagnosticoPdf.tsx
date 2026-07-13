import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Diagnostico } from "./diagnostico";

const NAVY = "#141a33";
const CORAL = "#ef7a72";
const INK = "#1f2540";
const MUTE = "#6b7192";
const LINE = "#e6e8f0";

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
    critico: { label: "CRITICO", cor: "#d1524a", bg: "#fdecea" },
    atencao: { label: "ATENCAO", cor: "#b5872a", bg: "#fbf3e0" },
    bom: { label: "BOM", cor: "#3f9d6d", bg: "#e8f6ee" },
};
function notaCor(n: number) { return n >= 66 ? "#3f9d6d" : n >= 40 ? "#b5872a" : "#d1524a"; }

const s = StyleSheet.create({
    page: { paddingTop: 40, paddingBottom: 46, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: INK, backgroundColor: "#ffffff" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
    brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
    brandNg: { color: CORAL },
    tag: { fontSize: 8, letterSpacing: 2, color: MUTE },
    hero: { backgroundColor: NAVY, borderRadius: 12, padding: 24, marginBottom: 18 },
    kicker: { fontSize: 8, letterSpacing: 1.5, color: CORAL, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    empresa: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    sub: { fontSize: 9, color: "#aab0cc", marginTop: 5 },
    scoreRow: { flexDirection: "row", alignItems: "center", marginTop: 18, gap: 16 },
    scoreBadge: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, alignItems: "center", justifyContent: "center" },
    scoreN: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    scoreMax: { fontSize: 7, color: "#aab0cc" },
    verdBox: { flex: 1 },
    verdLbl: { fontSize: 7, letterSpacing: 1, color: "#8990b0", marginBottom: 4 },
    verd: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1.35 },
    section: { marginBottom: 16 },
    h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 9 },
    resumo: { fontSize: 11, color: INK, lineHeight: 1.55 },
    eixo: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12, marginBottom: 8 },
    eixoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
    eixoNome: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
    badge: { fontSize: 7, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, letterSpacing: 0.5 },
    barBg: { height: 5, backgroundColor: "#eef0f6", borderRadius: 5, marginBottom: 8 },
    barFill: { height: 5, borderRadius: 5 },
    achado: { fontSize: 9.5, color: "#3a4062", lineHeight: 1.5, marginBottom: 5 },
    reco: { fontSize: 9.5, color: MUTE, lineHeight: 1.5 },
    recoB: { color: CORAL, fontFamily: "Helvetica-Bold" },
    mercado: { backgroundColor: "#f4f6fb", borderWidth: 1, borderColor: "#e2e6f0", borderRadius: 10, padding: 16 },
    mercadoLbl: { fontSize: 7, letterSpacing: 1.5, color: NAVY, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    mercadoT: { fontSize: 10, color: "#3a4062", lineHeight: 1.6 },
    prova: { backgroundColor: NAVY, borderRadius: 10, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 },
    provaLeft: { alignItems: "center", justifyContent: "center", paddingRight: 16, borderRightWidth: 1, borderRightColor: "#2c3358" },
    provaDe: { fontSize: 10, color: "#8990b0", textDecoration: "line-through" },
    provaSeta: { fontSize: 8, color: CORAL, marginVertical: 1 },
    provaPara: { fontSize: 26, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    provaMetrica: { fontSize: 7, color: "#8990b0", marginTop: 2 },
    provaRight: { flex: 1 },
    provaLbl: { fontSize: 7, letterSpacing: 1.5, color: CORAL, fontFamily: "Helvetica-Bold", marginBottom: 4 },
    provaCliente: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff", marginBottom: 3 },
    provaTxt: { fontSize: 9, color: "#c3c7db", lineHeight: 1.45 },
    opp: { backgroundColor: "#fbf1f0", borderWidth: 1, borderColor: "#f6d9d6", borderRadius: 10, padding: 18 },
    oppLbl: { fontSize: 7, letterSpacing: 1.5, color: CORAL, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    oppTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 5 },
    oppText: { fontSize: 10, color: "#3a4062", lineHeight: 1.55 },
    passo: { flexDirection: "row", gap: 12, marginBottom: 11, alignItems: "flex-start" },
    passoNum: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#fbeceb", alignItems: "center", justifyContent: "center" },
    passoNumT: { fontSize: 12, fontFamily: "Helvetica-Bold", color: CORAL },
    passoBody: { flex: 1 },
    passoTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    passoTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
    passoPrazo: { fontSize: 8, color: MUTE },
    passoDesc: { fontSize: 9.5, color: MUTE, lineHeight: 1.45, marginTop: 2 },
    cta: { marginTop: 6, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 18, alignItems: "center" },
    ctaH: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "center", marginBottom: 5 },
    ctaP: { fontSize: 9.5, color: MUTE, textAlign: "center", lineHeight: 1.5, maxWidth: 380 },
    foot: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
    footT: { fontSize: 7, color: "#9aa0bd" },
});

export function DiagnosticoPdf({ d, empresa, subtitulo, data }: { d: Diagnostico; empresa: string; subtitulo: string; data: string }) {
    return (
        <Document title={`Raio-X Comercial - ${empresa}`} author="Grupo NG">
            <Page size="A4" style={s.page}>
                <View style={s.header}>
                    <Text style={s.brand}>GRUPO <Text style={s.brandNg}>NG</Text></Text>
                    <Text style={s.tag}>RAIO-X COMERCIAL</Text>
                </View>

                <View style={s.hero}>
                    <Text style={s.kicker}>DIAGNOSTICO PREPARADO PARA</Text>
                    <Text style={s.empresa}>{empresa}</Text>
                    {!!subtitulo && <Text style={s.sub}>{subtitulo}{data ? `  |  ${data}` : ""}</Text>}
                    <View style={s.scoreRow}>
                        <View style={[s.scoreBadge, { borderColor: notaCor(d.nota_geral) }]}>
                            <Text style={s.scoreN}>{d.nota_geral}</Text>
                            <Text style={s.scoreMax}>/100</Text>
                        </View>
                        <View style={s.verdBox}>
                            <Text style={s.verdLbl}>MATURIDADE COMERCIAL E DIGITAL</Text>
                            <Text style={s.verd}>{d.veredito}</Text>
                        </View>
                    </View>
                </View>

                {!!d.resumo_executivo && (
                    <View style={s.section}>
                        <Text style={s.h2}>Resumo executivo</Text>
                        <Text style={s.resumo}>{d.resumo_executivo}</Text>
                    </View>
                )}

                {!!d.contexto_mercado && (
                    <View style={s.section} wrap={false}>
                        <View style={s.mercado}>
                            <Text style={s.mercadoLbl}>COMO ESSE MERCADO FUNCIONA</Text>
                            <Text style={s.mercadoT}>{d.contexto_mercado}</Text>
                        </View>
                    </View>
                )}

                {d.prova_social && (d.prova_social.para || d.prova_social.de) && (
                    <View style={s.section} wrap={false}>
                        <View style={s.prova}>
                            <View style={s.provaLeft}>
                                {!!d.prova_social.de && <Text style={s.provaDe}>{d.prova_social.de}</Text>}
                                <Text style={s.provaSeta}>para</Text>
                                <Text style={s.provaPara}>{d.prova_social.para}</Text>
                                {!!d.prova_social.metrica && <Text style={s.provaMetrica}>{d.prova_social.metrica.toUpperCase()}</Text>}
                            </View>
                            <View style={s.provaRight}>
                                <Text style={s.provaLbl}>JA FIZEMOS ISSO NO SEU SETOR</Text>
                                <Text style={s.provaCliente}>{d.prova_social.titulo}</Text>
                                <Text style={s.provaTxt}>
                                    {d.prova_social.o_que_fizemos}{d.prova_social.prazo ? ` (${d.prova_social.prazo}).` : "."}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                <View style={s.section}>
                    <Text style={s.h2}>O que analisamos</Text>
                    {d.eixos.map((e, i) => {
                        const st = STATUS[e.status] || STATUS.atencao;
                        return (
                            <View key={i} style={s.eixo} wrap={false}>
                                <View style={s.eixoHead}>
                                    <Text style={s.eixoNome}>{e.nome}</Text>
                                    <Text style={[s.badge, { color: st.cor, backgroundColor: st.bg }]}>{st.label}</Text>
                                </View>
                                <View style={s.barBg}><View style={[s.barFill, { width: `${e.nota * 10}%`, backgroundColor: st.cor }]} /></View>
                                <Text style={s.achado}>{e.achado}</Text>
                                <Text style={s.reco}><Text style={s.recoB}>O que fazer: </Text>{e.recomendacao}</Text>
                            </View>
                        );
                    })}
                </View>

                {!!d.oportunidade_central?.titulo && (
                    <View style={s.section} wrap={false}>
                        <View style={s.opp}>
                            <Text style={s.oppLbl}>A MAIOR ALAVANCA AGORA</Text>
                            <Text style={s.oppTitle}>{d.oportunidade_central.titulo}</Text>
                            <Text style={s.oppText}>{d.oportunidade_central.texto}</Text>
                        </View>
                    </View>
                )}

                {d.plano?.length > 0 && (
                    <View style={s.section} wrap={false}>
                        <Text style={s.h2}>Plano de acao</Text>
                        {d.plano.map((p) => (
                            <View key={p.passo} style={s.passo}>
                                <View style={s.passoNum}><Text style={s.passoNumT}>{p.passo}</Text></View>
                                <View style={s.passoBody}>
                                    <View style={s.passoTop}>
                                        <Text style={s.passoTitle}>{p.titulo}</Text>
                                        {!!p.prazo && <Text style={s.passoPrazo}>{p.prazo}</Text>}
                                    </View>
                                    <Text style={s.passoDesc}>{p.descricao}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={s.cta} wrap={false}>
                    <Text style={s.ctaH}>Tem mais pontos que impactam faturamento direto.</Text>
                    <Text style={s.ctaP}>Numa conversa de 20 minutos o Yuri te mostra o mapa completo e como destravar isso, sem compromisso.</Text>
                </View>

                <View style={s.foot} fixed>
                    <Text style={s.footT}>Grupo NG · Assessoria de Marketing e Vendas</Text>
                    <Text style={s.footT}>Diagnostico a partir de dados publicos</Text>
                </View>
            </Page>
        </Document>
    );
}
