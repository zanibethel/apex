/**
 * Apex's reviewed Nov 2026 inventory taxonomy.
 * Only import in protected server components/actions. The authenticated
 * supplier editor receives a scoped snapshot, not a public data endpoint.
 * Category assignments are proposals and require an explicit supplier save.
 */
export const apexTaxonomyStoreId="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
export const apexTaxonomyCategoryNames=Object.freeze(["Growth & Signaling","Hormonal Research","Immune Signaling","Metabolic Research","Neuro Research","Peptide Blends","Skin & Cosmetic Peptides","Tissue Research"]);
export const apexTaxonomyProposal=Object.freeze([
 {
  "id": "8c2c95c3-c43b-4286-a9fc-62cdb4d3aea3",
  "sku": "1001",
  "name": "5-Amino-1 MQ — 5 MG",
  "category": "GetSwole",
  "status": "Keep existing",
  "note": "Preserve the current admin/supplier assignment."
 },
 {
  "id": "db3ab20e-2f60-4441-b7e0-4f6d359ce474",
  "sku": "APX-5-AMINO-1-MQ-50-MG-D7C52E1C",
  "name": "5-Amino-1 MQ — 50 MG",
  "category": "GetSwole",
  "status": "Suggested",
  "note": "Same named compound as the existing GetSwole variant."
 },
 {
  "id": "7fe0ddbf-9365-4530-8037-5fe1c322c61b",
  "sku": "APX-AHK-CU-100-MG-6DD05514",
  "name": "AHK-CU — 100 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "dda1613d-2766-4366-bcaf-bdea25e7af53",
  "sku": "APX-AOD-9604-5-MG-2DA54380",
  "name": "AOD-9604 — 5 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "41e3958c-62c2-4fec-81d7-e1cf86e22ec3",
  "sku": "APX-ARA-290-10-MG-6B202671",
  "name": "ARA-290 — 10 MG",
  "category": "Tissue Research",
  "status": "Suggested",
  "note": "Research grouping, not a healing or treatment claim."
 },
 {
  "id": "fc411aa1-de87-4bfc-9d4b-5fcf8e389f62",
  "sku": "APX-BPC-157-10-MG-856957CC",
  "name": "BPC-157 — 10 MG",
  "category": "Tissue Research",
  "status": "Suggested",
  "note": "Research grouping, not a healing or treatment claim."
 },
 {
  "id": "974d3735-cb70-4f95-bfe9-584596350f31",
  "sku": "APX-BPC-157-5-MG-6D70A5FD",
  "name": "BPC-157 — 5 MG",
  "category": "Tissue Research",
  "status": "Suggested",
  "note": "Research grouping, not a healing or treatment claim."
 },
 {
  "id": "3ee75e8e-0570-4cd8-b0e7-69e4098fa0ba",
  "sku": "APX-CAGRILINTIDE-10-MG-654BB9F0",
  "name": "Cagrilintide — 10 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "3877702b-a0e7-41b3-a142-df65cfdbf0b0",
  "sku": "APX-CJC-1295-WITH-DAC-5-MG-DECD23C6",
  "name": "CJC-1295 (with DAC) — 5 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "2af49c0d-223a-4a87-83bb-f2c8a208db49",
  "sku": "APX-CJC-1295-WITHOUT-DAC-10-MG-8FD2011D",
  "name": "CJC-1295 (without DAC) — 10 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "b209ef75-bb21-4f92-b3b3-a8cf1395522c",
  "sku": "APX-CJC-1295-IPAMORELIN-10-MG-7571153D",
  "name": "CJC-1295 + Ipamorelin — 10 MG",
  "category": "Peptide Blends",
  "status": "Suggested",
  "note": "Supplier name explicitly identifies multiple peptide components; composition still requires verification."
 },
 {
  "id": "e8f488e7-8af7-4551-83b5-48df23242b99",
  "sku": "APX-DSIP-15-MG-239B64BB",
  "name": "DSIP — 15 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "31cc623b-e05b-4eb5-bd65-deb68838dff8",
  "sku": "APX-EPITHALON-10-MG-41C2653E",
  "name": "Epithalon — 10 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "9bb94b1f-d33c-4f0b-aeda-2876bf04f20e",
  "sku": "APX-EPITHALON-50-MG-8C4A5D9A",
  "name": "Epithalon — 50 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "18f203eb-d404-455d-b86a-2069174547c3",
  "sku": "APX-FOX-04-10-MG-418C129B",
  "name": "FOX-04 — 10 MG",
  "category": null,
  "status": "Review identity",
  "note": "Supplier description says compound identity is unverified."
 },
 {
  "id": "717eec70-e8ba-4e2b-aefe-8cdaf6c6f929",
  "sku": "APX-GHK-CU-100-MG-AD63784C",
  "name": "GHK-CU — 100 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "b7f07268-c1f7-4f66-be35-6998d3353df9",
  "sku": "APX-GHK-CU-50-MG-3E5E0912",
  "name": "GHK-CU — 50 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "85cbee5c-257a-43cd-ad17-86647fdfcbc5",
  "sku": "APX-GHRP-6-10-MG-42DE15CD",
  "name": "GHRP-6 — 10 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "ef76ff31-2bd5-4fc6-ac8c-7c2f5df56ee4",
  "sku": "APX-GLOW-70-MG-5016B5D7",
  "name": "GLOW — 70 MG",
  "category": null,
  "status": "Review composition",
  "note": "Branded blend composition and proportions have not been verified."
 },
 {
  "id": "ada625cb-72ea-4988-bc65-5517afbd2880",
  "sku": "APX-HCG-10-000-IU-2D39F051",
  "name": "HCG — 10,000 IU",
  "category": "Hormonal Research",
  "status": "Suggested",
  "note": "Research domain only; do not imply a clinical indication."
 },
 {
  "id": "41fd4125-99f0-4ef9-b8f4-a68fefd0f5c2",
  "sku": "APX-HEXARELIN-ACETATE-5-MG-9D16E540",
  "name": "Hexarelin Acetate — 5 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "67da4e11-73ee-4485-96e5-46fa00379d0c",
  "sku": "APX-HGH-FRAG-176-191-5-MG-E0D188E2",
  "name": "HGH-FRAG 176-191 — 5 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "c1a8bf19-5499-40aa-9c34-a581d9289399",
  "sku": "APX-IGF-1-LR3-1-MG-45F1F63A",
  "name": "IGF-1 LR3 — 1 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "d438063f-f920-45fc-9c03-b199ff73d1d0",
  "sku": "APX-IPAMORELIN-10-MG-3163267A",
  "name": "Ipamorelin — 10 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "ebf42492-a472-4eb9-850d-43e7566ba799",
  "sku": "APX-IPAMORELIN-5-MG-88FEA5BB",
  "name": "Ipamorelin — 5 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "050b7cfa-ddf0-42a8-b8ea-1100c95fd2ba",
  "sku": "APX-KISSPEPTIN-10-MG-3A94CA6C",
  "name": "Kisspeptin — 10 MG",
  "category": "Hormonal Research",
  "status": "Suggested",
  "note": "Research domain only; do not imply a clinical indication."
 },
 {
  "id": "9c3b3695-3b43-41a0-9777-f32910cc0d4b",
  "sku": "APX-KLOW-80-MG-3A672EFB",
  "name": "KLOW — 80 MG",
  "category": null,
  "status": "Review composition",
  "note": "Branded blend composition and proportions have not been verified."
 },
 {
  "id": "528b509f-6567-4ad9-bc2a-830b6f744b59",
  "sku": "APX-KPV-10-MG-9A1558C0",
  "name": "KPV — 10 MG",
  "category": "Immune Signaling",
  "status": "Suggested",
  "note": "Experimental signaling classification, not an immune benefit claim."
 },
 {
  "id": "84b0d7e6-e251-4ec6-90d3-a35c8d2fb821",
  "sku": "APX-LL-37-5-MG-6F4E9E10",
  "name": "LL-37 — 5 MG",
  "category": "Immune Signaling",
  "status": "Suggested",
  "note": "Experimental signaling classification, not an immune benefit claim."
 },
 {
  "id": "0d2f72d0-775a-4529-87e2-32623b7c7ecb",
  "sku": "APX-MELANOTAN-1-10-MG-05CFF1F0",
  "name": "Melanotan 1 — 10 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "f3a3b312-5159-41cb-a5b2-413d804eb0af",
  "sku": "APX-MELANOTAN-2-10-MG-9CFB30F8",
  "name": "Melanotan 2 — 10 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "9d008525-f684-43df-8d9e-d80d8a1509e6",
  "sku": "APX-MOTS-C-10-MG-9DE1EA25",
  "name": "MOTS-C — 10 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "59804ccd-040a-4937-a63f-8c22d72ee045",
  "sku": "APX-MOTS-C-40-MG-9ADF3963",
  "name": "MOTS-C — 40 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "c361fc7c-55aa-4f2b-9ecf-9ff78ced1f1f",
  "sku": "APX-NAD-1000-MG-09AF0907",
  "name": "NAD+ — 1000 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "f2b22ecf-004a-4b55-9c43-1a175a7b21ea",
  "sku": "APX-NAD-500-MG-4EC470B1",
  "name": "NAD+ — 500 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "c1371ae6-0870-493f-9dd9-11ab48192939",
  "sku": "APX-OXYTOCIN-2-MG-2C84AE6D",
  "name": "Oxytocin — 2 MG",
  "category": "Hormonal Research",
  "status": "Suggested",
  "note": "Research domain only; do not imply a clinical indication."
 },
 {
  "id": "7ad59b21-ac57-43b8-ad5a-044239c83456",
  "sku": "APX-PEG-MGF-2-MG-1C0DE199",
  "name": "PEG MGF — 2 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "5044bb4d-394e-43e0-baa1-304c0cfce8de",
  "sku": "APX-PINEALON-20-MG-A4FDA0FE",
  "name": "Pinealon — 20 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "072a3633-2b86-4961-8e7e-a92aefd6842f",
  "sku": "APX-PNC-27-10-MG-175064FD",
  "name": "PNC-27 — 10 MG",
  "category": null,
  "status": "Review evidence",
  "note": "Verify product identity and supporting documentation before assigning a public-facing research group."
 },
 {
  "id": "b4a9ce1e-8cee-4ed5-8318-f29f554912d3",
  "sku": "APX-PT-141-10-MG-5D6C1DBF",
  "name": "PT-141 — 10 MG",
  "category": "Hormonal Research",
  "status": "Suggested",
  "note": "Research domain only; do not imply a clinical indication."
 },
 {
  "id": "1a697975-4c9c-4794-8c0d-766ae4ab67c4",
  "sku": "APX-SELANK-10-MG-55810DA7",
  "name": "Selank — 10 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "7d3e05ab-5c83-4257-a172-ae2292beedb6",
  "sku": "APX-SEMAX-10-MG-2DAD6DEE",
  "name": "Semax — 10 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "1b954bcc-4584-4ba0-a9fd-16ffcf807a28",
  "sku": "APX-SEMAX-5-MG-2F965AD2",
  "name": "Semax — 5 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "d9b80725-d6ba-4649-b022-5ace49bd869c",
  "sku": "APX-SERMORELIN-10-MG-E358D7E0",
  "name": "Sermorelin — 10 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "625a339f-b2ff-4811-9bb5-0fdd32ef2449",
  "sku": "APX-SLU-PP-322-5-MG-8795ACC7",
  "name": "SLU-PP-322 — 5 MG",
  "category": null,
  "status": "Review identity",
  "note": "Supplier listing may be confused with a differently numbered compound."
 },
 {
  "id": "0004cf85-50cc-4ee7-8e52-3979b6ce5763",
  "sku": "APX-SNAP-8-10-MG-4FB4AAF4",
  "name": "SNAP-8 — 10 MG",
  "category": "Skin & Cosmetic Peptides",
  "status": "Suggested",
  "note": "Structural/research grouping; do not imply proven cosmetic benefits."
 },
 {
  "id": "06cbb056-673a-405c-a20a-8b2c57646450",
  "sku": "APX-SS-31-10-MG-1A8CBC32",
  "name": "SS-31 — 10 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "b73ce368-6425-4691-b642-68da29adebf6",
  "sku": "APX-SS-31-50-MG-5B06BD0A",
  "name": "SS-31 — 50 MG",
  "category": "Metabolic Research",
  "status": "Suggested",
  "note": "Research grouping, not a claim of product efficacy."
 },
 {
  "id": "ada8e4e0-75a4-47fb-9172-2b3ff5c733e7",
  "sku": "APX-T2-10-MG-DFA370D1",
  "name": "T2 — 10 MG",
  "category": null,
  "status": "Review identity",
  "note": "Thyroid derivative identity/isomer is not confirmed."
 },
 {
  "id": "e8fa9046-aae0-40dd-938c-754768d89aaf",
  "sku": "APX-T2-30-MG-F6AECFE2",
  "name": "T2 — 30 MG",
  "category": null,
  "status": "Review identity",
  "note": "Thyroid derivative identity/isomer is not confirmed."
 },
 {
  "id": "969d03ce-49c0-402f-b5ea-d59f4d5f3218",
  "sku": "APX-T2-60-MG-D78FEB5D",
  "name": "T2 — 60 MG",
  "category": null,
  "status": "Review identity",
  "note": "Thyroid derivative identity/isomer is not confirmed."
 },
 {
  "id": "44a40ead-bd19-446e-b55b-6409b4742d80",
  "sku": "APX-T3-10-MG-23EE1BE1",
  "name": "T3 — 10 MG",
  "category": null,
  "status": "Review strength",
  "note": "Thyroid hormone; listed milligram strength requires careful verification."
 },
 {
  "id": "cbf26875-3ada-4017-92c3-072ef7f6a2d4",
  "sku": "APX-T3-20-MG-E1291F09",
  "name": "T3 — 20 MG",
  "category": null,
  "status": "Review strength",
  "note": "Thyroid hormone; listed milligram strength requires careful verification."
 },
 {
  "id": "6afb5548-465b-42aa-bb86-cc905429b7db",
  "sku": "APX-T3-30-MG-04DBFBFC",
  "name": "T3 — 30 MG",
  "category": null,
  "status": "Review strength",
  "note": "Thyroid hormone; listed milligram strength requires careful verification."
 },
 {
  "id": "815d5cd5-8214-45c6-a9bb-7ebe5b572db6",
  "sku": "APX-T3-5-MG-D2E346CF",
  "name": "T3 — 5 MG",
  "category": null,
  "status": "Review strength",
  "note": "Thyroid hormone; listed milligram strength requires careful verification."
 },
 {
  "id": "9dd7fe65-3ad3-4ea0-9cd0-9b1dbb827add",
  "sku": "APX-T3-60-MG-D9DF523D",
  "name": "T3 — 60 MG",
  "category": null,
  "status": "Review strength",
  "note": "Thyroid hormone; listed milligram strength requires careful verification."
 },
 {
  "id": "0ced81d6-fd85-42ba-ac59-163d4197821e",
  "sku": "APX-TB-500-10-MG-E9A3EC37",
  "name": "TB-500 — 10 MG",
  "category": "Tissue Research",
  "status": "Suggested",
  "note": "Research grouping, not a healing or treatment claim."
 },
 {
  "id": "41f49d21-d9f7-40fc-9746-9029c47b6283",
  "sku": "APX-TESAMORELIN-10-MG-A682A864",
  "name": "Tesamorelin — 10 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "10837a7a-723d-4435-bdbb-c7a7ea6c5185",
  "sku": "APX-TESAMORELIN-5-MG-BD39099E",
  "name": "Tesamorelin — 5 MG",
  "category": "Growth & Signaling",
  "status": "Suggested",
  "note": "Research family classification only; not a clinical claim."
 },
 {
  "id": "745af251-795d-4a4e-b08a-51143034ca76",
  "sku": "APX-THYMALIN-10-MG-DA0CF83A",
  "name": "Thymalin — 10 MG",
  "category": "Immune Signaling",
  "status": "Suggested",
  "note": "Experimental signaling classification, not an immune benefit claim."
 },
 {
  "id": "09d60cea-e2be-4fe4-b9de-eb1a61d3fd8d",
  "sku": "APX-THYMOSIN-ALPHA-1-10-MG-6CFAD47A",
  "name": "Thymosin Alpha 1 — 10 MG",
  "category": "Immune Signaling",
  "status": "Suggested",
  "note": "Experimental signaling classification, not an immune benefit claim."
 },
 {
  "id": "90e45d57-5cd4-475e-92ad-ce9cab42d087",
  "sku": "APX-VIP-10-MG-B2D7697F",
  "name": "VIP — 10 MG",
  "category": "Neuro Research",
  "status": "Suggested",
  "note": "Exploratory research grouping, not a neurological health claim."
 },
 {
  "id": "0bad8ec2-af74-4f97-846b-67f15d5e5c8e",
  "sku": "APX-WOLVERINE-BLEND-TB-500-BPC-1-2B54419F",
  "name": "Wolverine Blend (TB-500 + BPC-157) — 20 MG",
  "category": "Peptide Blends",
  "status": "Suggested",
  "note": "Supplier name explicitly identifies multiple peptide components; composition still requires verification."
 }
].map(item=>Object.freeze(item)));
