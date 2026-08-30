import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./PropertyDetail.css";
import localImage from "../assets/properties/local.jpeg";

function PropertyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProperty();
  }, [id]);

  async function fetchProperty() {
    setLoading(true);

    const { data: propertyData, error } = await supabase
      .from("add_business")
      .select("*")
      .eq("business_id", id)
      .single();

    if (error) {
      console.error("Error fetching property:", error);
      setLoading(false);
      return;
    }

    setProperty(propertyData);

    // Buscar información del propietario
    if (propertyData?.owner_id) {
      const { data: ownerData, error: ownerError } = await supabase
        .from("users")
        .select("*")
        .eq("id_supabase_auth", propertyData.owner_id)
        .single();

      if (ownerError) {
        console.error("Error fetching owner:", ownerError);
      }

      setOwner(ownerData);
    }

    setLoading(false);
  }

  async function handleSaveProperty() {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData?.user) return;

    if (saved) {
      await supabase
        .from("saved_properties")
        .delete()
        .eq("business_id", id)
        .eq("user_id", authData.user.id);
    } else {
      await supabase.from("saved_properties").insert({
        business_id: id,
        user_id: authData.user.id,
      });
    }

    setSaved(!saved);
  }

  if (loading) {
    return (
      <div className="pd-loading">
        Loading property...
      </div>
    );
  }

  if (!property) {
    return (
      <div className="pd-loading">
        Property not found.
      </div>
    );
  }

  const monthlyRent = Number(property.monthly_rent) || 0;

  const amenities = [
    {
      icon: "bi-building",
      label: property.property_type || "Business Space",
    },
    {
      icon: "bi-rulers",
      label: `${property.business_size_length || "N/A"} size`,
    },
    {
      icon: "bi-calendar-check",
      label:
        property.availability || "Availability not specified",
    },
    {
      icon: "bi-shield-check",
      label: "Verified Property",
    },
    {
      icon: "bi-lightbulb",
      label: "Ready to Use",
    },
    {
      icon: "bi-person-check",
      label: "Direct Owner",
    },
  ];

  return (
    <div className="pd-page container-fluid">

      <div className="row g-4">

        <div className="col-12 col-xl-8">

          <div className="pd-main">

            <div className="card pd-gallery">

              <div className="pd-gallery-main">
                <img
                  src={localImage}
                  alt={property.property_name}
                  className="pd-gallery-image"
                />

                <span className="pd-badge-available">
                  {property.availability || "Available"}
                </span>

                <div className="pd-gallery-overlay">

                  <h2>
                    {property.property_name}
                  </h2>

                </div>

              </div>

            </div>

            <div className="pd-location-row">

              <div className="pd-location-info">

                <p className="pd-location-line">

                  <i className="bi bi-building"></i>

                  {property.property_type ||
                    "Business Space"}

                </p>

                <div className="pd-chips">

                  <span className="pd-chip">
                    {property.business_size_length ||
                      "N/A"}{" "}
                    size
                  </span>

                  <span className="pd-chip">
                    {property.availability ||
                      "Availability not specified"}
                  </span>

                  <span className="pd-chip">
                    Business Space
                  </span>

                </div>

              </div>


              {/* PRICE */}
              <div className="pd-price-card">

                <p className="pd-price">

                  ${monthlyRent.toFixed(2)}

                  <span>
                    /month
                  </span>

                </p>

              </div>

            </div>

            <div className="card pd-card">

              <div className="card-body">

                <h3>
                  About this space
                </h3>

                <p>
                  This space is available for rent
                  and is classified as{" "}
                  <strong>
                    {property.property_type ||
                      "business space"}
                  </strong>.
                  The current availability is{" "}
                  <strong>
                    {property.availability ||
                      "not specified"}
                  </strong>.
                </p>

              </div>

            </div>

            <div className="card pd-card">

              <div className="card-body">

                <h3>
                  Space Information
                </h3>

                <div className="row g-3">

                  {amenities.map((item) => (

                    <div
                      className="col-12 col-md-6 col-lg-4"
                      key={item.label}
                    >

                      <div className="pd-amenity-item">

                        <i
                          className={`bi ${item.icon}`}
                        ></i>

                        <span>
                          {item.label}
                        </span>

                      </div>

                    </div>

                  ))}

                </div>

              </div>

            </div>

            <div className="card pd-card">

              <div className="card-body">

                <div className="pd-owner-card-header">

                  <h3>
                    Property Owner
                  </h3>

                  <span className="pd-verified-badge">

                    <i className="bi bi-check-circle-fill"></i>

                    VERIFIED

                  </span>

                </div>


                <div className="pd-owner-info">

                  <div className="pd-owner-avatar">

                    {owner?.full_name
                      ? owner.full_name
                        .charAt(0)
                        .toUpperCase()
                      : "N"}

                  </div>


                  <div>

                    <p className="pd-owner-name">

                      {owner?.full_name ||
                        "Property Owner"}

                    </p>

                    <p className="pd-owner-meta">
                      Direct contact
                    </p>


                    {property.phone_number && (

                      <p className="pd-owner-meta">

                        <i className="bi bi-telephone"></i>{" "}

                        {property.phone_number}

                      </p>

                    )}

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

        <div className="col-12 col-xl-4">

          <div className="pd-sidebar">

            <div className="card pd-card">

              <div className="card-body">

                <h3>
                  Rental Summary
                </h3>

                <div className="pd-summary-row">

                  <span>
                    Monthly Rent
                  </span>

                  <span>
                    ${monthlyRent.toFixed(2)}
                  </span>

                </div>

                <div className="pd-summary-row">

                  <span>
                    Property Type
                  </span>

                  <span>
                    {property.property_type ||
                      "N/A"}
                  </span>

                </div>

                <div className="pd-summary-row">

                  <span>
                    Availability
                  </span>

                  <span>
                    {property.availability ||
                      "N/A"}
                  </span>

                </div>

                <div className="pd-summary-row">

                  <span>
                    Size
                  </span>

                  <span>
                    {property.business_size_length ||
                      "N/A"}
                  </span>

                </div>

                <button
                  type="button"
                  className="btn pd-btn-primary w-100"
                  onClick={() =>
                    navigate(`/contract/${id}`)
                  }
                >

                  <i className="bi bi-file-earmark-check"></i>

                  Start Contract

                </button>

                <button
                  type="button"
                  className="btn pd-btn-outline w-100"
                  onClick={() =>
                    navigate(
                      `/messages/${owner?.id_supabase_auth}`
                    )
                  }
                >

                  <i className="bi bi-chat-dots"></i>

                  Contact Owner

                </button>


                {/* PROTECTION */}
                <div className="pd-protection-note">

                  <i className="bi bi-shield-check"></i>

                  <p>
                    Your contract is protected by
                    NextSpace. We're with you every
                    step of the way during your first
                    rental.
                  </p>

                </div>


                {/* ACTIONS */}
                <div className="pd-action-icons">

                  {/* SHARE */}
                  <button
                    type="button"
                    onClick={() => {

                      if (navigator.share) {

                        navigator.share({
                          url: window.location.href,
                        });

                      }

                    }}
                  >

                    <i className="bi bi-share"></i>

                    Share

                  </button>


                  {/* SAVE */}
                  <button
                    type="button"
                    onClick={handleSaveProperty}
                  >

                    <i
                      className={`bi ${saved
                        ? "bi-heart-fill"
                        : "bi-heart"
                        }`}
                    ></i>

                    {saved ? "Saved" : "Save"}

                  </button>


                  {/* ASK */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/advisor?propertyId=${id}`
                      )
                    }
                  >

                    <i className="bi bi-question-circle"></i>

                    Ask

                  </button>

                </div>

              </div>

            </div>

            <div className="card pd-card pd-ai-card">

              <div className="card-body">

                <h3>

                  <i className="bi bi-lightbulb-fill"></i>

                  Is this space for you?

                </h3>


                <p>

                  We analyzed this space and it may
                  be suitable for your business needs.

                </p>


                <button
                  type="button"
                  className="btn pd-ai-button w-100"
                  onClick={() =>
                    navigate(
                      `/advisor?propertyId=${id}`
                    )
                  }
                >

                  <i className="bi bi-stars"></i>

                  Analyze with AI

                </button>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default PropertyDetailPage;